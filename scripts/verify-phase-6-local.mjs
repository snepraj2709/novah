import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const EMAIL_A = 'phase6-browser-a@example.test';
const EMAIL_B = 'phase6-browser-b@example.test';
const PASSWORD = 'Synthetic-phase6-password!';

function localConfiguration() {
  const output = execFileSync(
    'pnpm',
    ['exec', 'supabase', 'status', '--output', 'json'],
    {
      encoding: 'utf8',
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const start = output.indexOf('{');
  if (start < 0) throw new Error('Local Supabase status was not JSON.');
  return JSON.parse(output.slice(start));
}

async function deleteFixtureUsers(admin) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1_000 });
  if (error) throw error;
  const fixtureUsers = data.users.filter(
    (user) => user.email === EMAIL_A || user.email === EMAIL_B,
  );
  for (const user of fixtureUsers) {
    const result = await admin.auth.admin.deleteUser(user.id, false);
    if (result.error) throw result.error;
  }
}

async function createUser(admin, email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Fixture user missing.');
  return data.user;
}

async function assertAccountDeletionIsolation(admin, configuration) {
  const { data: users, error: usersError } = await admin.auth.admin.listUsers({
    perPage: 1_000,
  });
  if (usersError) throw usersError;
  if (users.users.some((user) => user.email === EMAIL_A)) {
    throw new Error('Deleted fixture account A still exists.');
  }
  const clientA = createClient(configuration.API_URL, configuration.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clientB = createClient(configuration.API_URL, configuration.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [signInA, signInB] = await Promise.all([
    clientA.auth.signInWithPassword({ email: EMAIL_A, password: PASSWORD }),
    clientB.auth.signInWithPassword({ email: EMAIL_B, password: PASSWORD }),
  ]);
  if (!signInA.error) throw new Error('Deleted fixture account A can sign in.');
  if (signInB.error) throw signInB.error;
  const { data: notesB, error: notesBError } = await clientB
    .from('notes')
    .select('original_text');
  if (
    notesBError ||
    notesB.length !== 1 ||
    notesB[0]?.original_text !== 'User B isolation fixture.'
  ) {
    throw notesBError ?? new Error('Account deletion affected user B.');
  }
  const { count: userARows, error: cascadeError } = await admin
    .from('notes')
    .select('id', { count: 'exact', head: true })
    .eq('original_text', 'User A browser fixture.');
  if (cascadeError || userARows !== 0) {
    throw cascadeError ?? new Error('Deleted account rows did not cascade.');
  }
}

async function main() {
  const configuration = localConfiguration();
  const admin = createClient(
    configuration.API_URL,
    configuration.SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  if (process.argv.includes('--assert-account-delete')) {
    await assertAccountDeletionIsolation(admin, configuration);
    console.log(JSON.stringify({ accountDeletionIsolation: true }));
    return;
  }
  if (process.argv.includes('--assert-owned-delete')) {
    const clientA = createClient(
      configuration.API_URL,
      configuration.ANON_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const clientB = createClient(
      configuration.API_URL,
      configuration.ANON_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const [signInA, signInB] = await Promise.all([
      clientA.auth.signInWithPassword({ email: EMAIL_A, password: PASSWORD }),
      clientB.auth.signInWithPassword({ email: EMAIL_B, password: PASSWORD }),
    ]);
    if (signInA.error) throw signInA.error;
    if (signInB.error) throw signInB.error;
    const [notesA, reviewsA, notesB] = await Promise.all([
      clientA.from('notes').select('original_text'),
      clientA.from('review_events').select('id'),
      clientB.from('notes').select('original_text'),
    ]);
    if (notesA.error || reviewsA.error || notesB.error) {
      throw notesA.error ?? reviewsA.error ?? notesB.error;
    }
    if (
      notesA.data.length !== 0 ||
      reviewsA.data.length !== 0 ||
      notesB.data.length !== 1 ||
      notesB.data[0]?.original_text !== 'User B isolation fixture.'
    ) {
      throw new Error('Owned delete isolation verification failed.');
    }
    console.log(JSON.stringify({ ownedDeleteIsolation: true }));
    return;
  }
  await deleteFixtureUsers(admin);
  if (process.argv.includes('--cleanup')) {
    console.log(JSON.stringify({ cleaned: true }));
    return;
  }

  const [userA, userB] = await Promise.all([
    createUser(admin, EMAIL_A),
    createUser(admin, EMAIL_B),
  ]);
  const now = new Date();
  const capturedAt = now.toISOString();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const { data: notes, error: notesError } = await admin
    .from('notes')
    .insert([
      {
        user_id: userA.id,
        client_request_id: crypto.randomUUID(),
        original_text: 'User A browser fixture.',
        personal_context: 'Verifies the Phase 6 personal dashboard boundary.',
        note_type: 'lesson',
        source_title: 'Phase 6 browser fixture A',
        source_url: 'https://example.invalid/phase6/a',
        capture_channel: 'web',
        captured_at: capturedAt,
      },
      {
        user_id: userB.id,
        client_request_id: crypto.randomUUID(),
        original_text: 'User B isolation fixture.',
        personal_context: 'Negative isolation fixture.',
        note_type: 'observation',
        source_title: 'Phase 6 browser fixture B',
        source_url: 'https://example.invalid/phase6/b',
        capture_channel: 'web',
        captured_at: capturedAt,
      },
    ])
    .select('id,user_id');
  if (notesError || !notes)
    throw notesError ?? new Error('Fixture notes missing.');
  const noteA = notes.find((note) => note.user_id === userA.id);
  if (!noteA) throw new Error('User A fixture note missing.');

  const { error: reviewError } = await admin.from('review_events').insert({
    user_id: userA.id,
    note_id: noteA.id,
    stage: 1,
    due_on: today,
    status: 'pending',
  });
  if (reviewError) throw reviewError;

  const { error: digestError } = await admin.from('daily_digests').insert({
    user_id: userA.id,
    digest_date: today,
    note_ids: [noteA.id],
    content: {
      captureCount: 1,
      sourceCount: 1,
      themes: [],
      connection: null,
      reflectionQuestion: 'How will you apply the ownership boundary tomorrow?',
    },
  });
  if (digestError) throw digestError;

  const userAClient = createClient(
    configuration.API_URL,
    configuration.ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const signIn = await userAClient.auth.signInWithPassword({
    email: EMAIL_A,
    password: PASSWORD,
  });
  if (signIn.error) throw signIn.error;
  const { data: visibleNotes, error: visibleError } = await userAClient
    .from('notes')
    .select('id,user_id');
  if (visibleError) throw visibleError;
  if (visibleNotes.length !== 1 || visibleNotes[0]?.user_id !== userA.id) {
    throw new Error('Authenticated network isolation verification failed.');
  }

  if (process.argv.includes('--exercise-account-delete')) {
    try {
      const endpoint = `${configuration.API_URL}/functions/v1/delete-account`;
      const unauthorized = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (unauthorized.status !== 401) {
        throw new Error('Account deletion accepted an unsigned request.');
      }

      const accessToken = signIn.data.session?.access_token;
      if (!accessToken) throw new Error('Password sign-in token is missing.');
      const authorizedHeaders = {
        apikey: configuration.ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };
      const forbiddenOrigin = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...authorizedHeaders,
          Origin: 'https://not-novah.example',
        },
        body: '{}',
      });
      if (forbiddenOrigin.status !== 403) {
        throw new Error(
          'Account deletion accepted an unlisted browser origin.',
        );
      }

      const deleted = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...authorizedHeaders,
          Origin: 'http://127.0.0.1:5173',
        },
        body: '{}',
      });
      const payload = await deleted.json();
      if (deleted.status !== 200 || payload?.deleted !== true) {
        const errorCode =
          payload &&
          typeof payload === 'object' &&
          payload.error &&
          typeof payload.error === 'object' &&
          typeof payload.error.code === 'string'
            ? payload.error.code
            : 'unknown';
        throw new Error(
          `Fresh password authentication did not delete account A (${deleted.status}, ${errorCode}).`,
        );
      }
      await assertAccountDeletionIsolation(admin, configuration);
      console.log(
        JSON.stringify({
          accountDeletionEndpoint: true,
          unsignedDenied: true,
          unlistedOriginDenied: true,
          callerCascade: true,
          otherUserIsolated: true,
        }),
      );
    } finally {
      await deleteFixtureUsers(admin);
    }
    return;
  }

  console.log(
    JSON.stringify({
      fixtureReady: true,
      networkIsolation: true,
      credentialsPrinted: false,
      identifiersPrinted: false,
      noteContentPrinted: false,
    }),
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Phase 6 local verifier failed.',
  );
  process.exitCode = 1;
});
