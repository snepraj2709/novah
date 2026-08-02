import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const EXPECTED_PROJECT_REF = 'fqinppulljqefbvukcpg';
const FIXTURE_GUARD = 'NOVAH_APPROVE_PHASE7_HOSTED_AUDIT';
const FIXTURE_MARKER = 'novah-phase-7-hosted-audit';
const EMAIL_PREFIX = 'novah-phase7-audit-';
const supabaseUrl = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const functionsUrl = `${supabaseUrl}/functions/v1`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  process.env[FIXTURE_GUARD] === EXPECTED_PROJECT_REF,
  `Set ${FIXTURE_GUARD} to the exact Novah project reference after explicit approval`,
);

function loadProjectKeys() {
  try {
    const output = execFileSync(
      'pnpm',
      [
        'exec',
        'supabase',
        'projects',
        'api-keys',
        '--project-ref',
        EXPECTED_PROJECT_REF,
        '--output',
        'json',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return JSON.parse(output);
  } catch {
    throw new Error(
      'Unable to load hosted verification credentials from the authenticated Supabase CLI',
    );
  }
}

function projectKey(keys, predicate) {
  const match = keys.find(predicate);
  if (!match?.api_key) {
    throw new Error('The expected Supabase project API key is unavailable');
  }
  return match.api_key;
}

const projectKeys = loadProjectKeys();
const publishableKey = projectKey(
  projectKeys,
  (key) => key.type === 'publishable',
);
const serviceRoleKey = projectKey(
  projectKeys,
  (key) => key.name === 'service_role',
);
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const createdUserIds = new Set();

async function fixtureUsers() {
  const matches = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1_000,
    });
    if (error) throw error;
    matches.push(
      ...data.users.filter(
        (user) =>
          user.user_metadata?.fixture === FIXTURE_MARKER ||
          user.email?.startsWith(EMAIL_PREFIX),
      ),
    );
    if (data.users.length < 1_000) return matches;
  }
}

async function cleanup() {
  const users = new Map(
    [
      ...(await fixtureUsers()),
      ...[...createdUserIds].map((id) => ({ id })),
    ].map((user) => [user.id, user]),
  );
  const failures = [];
  for (const user of users.values()) {
    const { error } = await admin.auth.admin.deleteUser(user.id, false);
    if (error && error.status !== 404) failures.push(error);
  }
  if (failures.length > 0) {
    throw new Error('Hosted fixture cleanup was incomplete');
  }
}

async function createUser(label) {
  const email = `${EMAIL_PREFIX}${label}-${randomUUID()}@example.invalid`;
  const password = randomBytes(32).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { fixture: FIXTURE_MARKER },
  });
  if (error || !data.user) throw error ?? new Error('Fixture user missing');
  createdUserIds.add(data.user.id);
  return { id: data.user.id, email, password };
}

function publicClient() {
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(user) {
  const client = publicClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data.session?.access_token) {
    throw error ?? new Error('Password sign-in token missing');
  }
  return { client, accessToken: data.session.access_token };
}

async function functionRequest(slug, accessToken, body, extraHeaders = {}) {
  return fetch(`${functionsUrl}/${slug}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

async function insertOwnedFixtures(userA, userB) {
  const noteAId = randomUUID();
  const noteBId = randomUUID();
  const capturedAt = new Date().toISOString();
  const digestDate = capturedAt.slice(0, 10);
  const { error: noteError } = await admin.from('notes').insert([
    {
      id: noteAId,
      user_id: userA.id,
      client_request_id: randomUUID(),
      original_text: 'Hosted deletion fixture owned by user A.',
      note_type: 'lesson',
      summary: 'HOSTED AUDIT USER A',
      tags: ['hosted-audit'],
      recall_prompt: 'Which account owns fixture A?',
      capture_channel: 'web',
      captured_at: capturedAt,
    },
    {
      id: noteBId,
      user_id: userB.id,
      client_request_id: randomUUID(),
      original_text: 'Hosted isolation fixture owned by user B.',
      note_type: 'lesson',
      summary: 'HOSTED AUDIT USER B',
      tags: ['hosted-audit'],
      recall_prompt: 'Which account owns fixture B?',
      capture_channel: 'web',
      captured_at: capturedAt,
    },
  ]);
  if (noteError) throw noteError;

  const { error: reviewsError } = await admin.from('review_events').insert(
    [1, 2, 3, 4, 5].map((stage) => ({
      user_id: userA.id,
      note_id: noteAId,
      stage,
      due_on: digestDate,
    })),
  );
  if (reviewsError) throw reviewsError;
  const { error: digestError } = await admin.from('daily_digests').insert({
    user_id: userA.id,
    digest_date: digestDate,
    note_ids: [noteAId],
    content: {
      captureCount: 1,
      sourceCount: 0,
      themes: [],
      connection: null,
      reflectionQuestion: 'What should be retained?',
    },
  });
  if (digestError) throw digestError;
  return { noteBId };
}

async function ownedRowCount(table, userId) {
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}

async function run() {
  await cleanup();
  const userA = await createUser('a');
  const userB = await createUser('b');
  const [{ client: clientA, accessToken }, { client: clientB }] =
    await Promise.all([signIn(userA), signIn(userB)]);

  const { error: timezoneError } = await clientA
    .from('profiles')
    .update({ timezone: 'UTC' })
    .eq('user_id', userA.id);
  assert(!timezoneError, 'User-editable profile columns are not writable');

  const { error: chatIdError } = await clientA
    .from('profiles')
    .update({ telegram_chat_id: 7_000_000_007 })
    .eq('user_id', userA.id);
  assert(chatIdError, 'Authenticated client set a server-managed chat ID');
  const { data: profileA, error: profileError } = await clientA
    .from('profiles')
    .select('telegram_chat_id')
    .single();
  assert(
    !profileError && profileA?.telegram_chat_id === null,
    'Chat ID denial did not preserve the unlinked profile',
  );

  const { error: oversizedError } = await clientA.from('notes').insert({
    user_id: userA.id,
    client_request_id: randomUUID(),
    original_text: 'x'.repeat(20_001),
    note_type: 'lesson',
    summary: 'Rejected oversized fixture.',
    tags: ['hosted-audit'],
    recall_prompt: 'Should this be rejected?',
    capture_channel: 'web',
  });
  assert(
    oversizedError?.code === '23514',
    'Database accepted oversized direct note text',
  );

  const { error: hashError } = await clientA
    .from('telegram_link_codes')
    .insert({
      user_id: userA.id,
      code_hash: 'not-a-sha-256-hash',
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
  assert(
    hashError?.code === '23514',
    'Database accepted a malformed link-code hash',
  );

  const linkResponse = await functionRequest(
    'telegram-link-code',
    accessToken,
    {},
  );
  assert(
    linkResponse.status === 200,
    'Hosted link-code function did not accept user A',
  );
  const linkPayload = await linkResponse.json();
  assert(
    linkPayload?.connected === false && typeof linkPayload.code === 'string',
    'Hosted link-code response is invalid',
  );
  const { data: storedCodes, error: codeError } = await admin
    .from('telegram_link_codes')
    .select('code_hash, consumed_at')
    .eq('user_id', userA.id);
  assert(
    !codeError && storedCodes?.length === 1,
    'Hosted link code was not stored exactly once',
  );
  assert(
    /^[0-9a-f]{64}$/u.test(storedCodes[0].code_hash),
    'Hosted link code is not stored as SHA-256',
  );
  assert(
    storedCodes[0].code_hash !== linkPayload.code,
    'Hosted link code was stored in plaintext',
  );

  const { noteBId } = await insertOwnedFixtures(userA, userB);

  const unsigned = await functionRequest('delete-account', null, {});
  assert(unsigned.status === 401, 'Gateway accepted unsigned account deletion');
  const forbiddenOrigin = await functionRequest(
    'delete-account',
    accessToken,
    {},
    { Origin: 'https://not-novah.example' },
  );
  assert(
    forbiddenOrigin.status === 403,
    'Account deletion accepted an unlisted origin',
  );
  const suppliedUserId = await functionRequest('delete-account', accessToken, {
    userId: userB.id,
  });
  assert(
    suppliedUserId.status === 400,
    'Account deletion accepted a client-supplied user ID',
  );

  const deleted = await functionRequest('delete-account', accessToken, {});
  const deletedPayload = await deleted.json();
  assert(
    deleted.status === 200 && deletedPayload?.deleted === true,
    'Fresh password-authenticated deletion failed',
  );
  createdUserIds.delete(userA.id);

  const userASignIn = await publicClient().auth.signInWithPassword({
    email: userA.email,
    password: userA.password,
  });
  assert(userASignIn.error, 'Deleted user A can still sign in');
  for (const table of [
    'profiles',
    'notes',
    'review_events',
    'daily_digests',
    'telegram_link_codes',
  ]) {
    assert(
      (await ownedRowCount(table, userA.id)) === 0,
      `${table} retained user A rows`,
    );
  }
  const { data: notesB, error: notesBError } = await clientB
    .from('notes')
    .select('id, summary');
  assert(
    !notesBError &&
      notesB?.length === 1 &&
      notesB[0].id === noteBId &&
      notesB[0].summary === 'HOSTED AUDIT USER B',
    'Account deletion affected user B',
  );

  console.log(
    JSON.stringify({
      project: 'Novah',
      migrationConstraints: true,
      serverManagedBinding: true,
      linkCodeHashOnly: true,
      jwtGatewayDeniedUnsigned: true,
      corsDeniedUnlistedOrigin: true,
      clientUserIdDenied: true,
      recentPasswordDeletion: true,
      callerCascade: true,
      otherUserIsolated: true,
      openAiCalls: 0,
      telegramMessages: 0,
    }),
  );
}

let verificationError = null;
try {
  await run();
} catch (error) {
  verificationError = error;
} finally {
  try {
    await cleanup();
    const remaining = await fixtureUsers();
    assert(remaining.length === 0, 'Hosted fixture users remain after cleanup');
    console.log(JSON.stringify({ cleanup: true, remainingFixtureUsers: 0 }));
  } catch (cleanupError) {
    verificationError ??= cleanupError;
  }
}

if (verificationError) throw verificationError;
