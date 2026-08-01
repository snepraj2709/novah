import { randomBytes, randomUUID } from 'node:crypto';

const EXPECTED_PROJECT_REF = 'fqinppulljqefbvukcpg';

const supabaseUrl = requireEnvironment('NOVAH_TEST_SUPABASE_URL').replace(
  /\/$/,
  '',
);
const publishableKey = requireEnvironment(
  'NOVAH_TEST_SUPABASE_PUBLISHABLE_KEY',
);
const serviceRoleKey = requireEnvironment(
  'NOVAH_TEST_SUPABASE_SERVICE_ROLE_KEY',
);

const projectHost = new URL(supabaseUrl).hostname;
if (projectHost !== `${EXPECTED_PROJECT_REF}.supabase.co`) {
  throw new Error(`Refusing to test unexpected Supabase host: ${projectHost}`);
}

const authUrl = `${supabaseUrl}/auth/v1`;
const restUrl = `${supabaseUrl}/rest/v1`;
const createdUserIds = [];
const createdProcessedUpdateIds = [];
let cleanupCompleted = false;

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function unitVector(activeIndex) {
  return `[${Array.from({ length: 1_536 }, (_, index) =>
    index === activeIndex ? '1' : '0',
  ).join(',')}]`;
}

function publicHeaders(accessToken, extra = {}) {
  return {
    apikey: publishableKey,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...extra,
  };
}

function serviceHeaders(extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function request(url, options = {}, expectedStatuses = [200]) {
  const response = await fetch(url, options);
  if (!expectedStatuses.includes(response.status)) {
    const endpoint = new URL(url).pathname;
    throw new Error(
      `${options.method ?? 'GET'} ${endpoint} returned HTTP ${response.status}`,
    );
  }
  return response;
}

async function requestJson(url, options = {}, expectedStatuses = [200]) {
  const response = await request(url, options, expectedStatuses);
  if (response.status === 204) return null;
  return response.json();
}

async function createUser(label) {
  const email = `novah-phase1-${label}-${randomUUID()}@example.invalid`;
  const password = randomBytes(32).toString('base64url');
  const payload = await requestJson(
    `${authUrl}/admin/users`,
    {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { fixture: 'novah-phase-1-hosted-verification' },
      }),
    },
    [200, 201],
  );

  assert(payload?.id, `Auth admin did not return an ID for test user ${label}`);
  createdUserIds.push(payload.id);
  return { id: payload.id, email, password };
}

async function signIn(user) {
  const payload = await requestJson(`${authUrl}/token?grant_type=password`, {
    method: 'POST',
    headers: publicHeaders(null, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  assert(
    payload?.access_token,
    'Password sign-in did not return an access token',
  );
  return payload.access_token;
}

async function restJson(
  path,
  accessToken,
  options = {},
  expectedStatuses = [200],
) {
  return requestJson(
    `${restUrl}${path}`,
    {
      ...options,
      headers: publicHeaders(accessToken, {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      }),
    },
    expectedStatuses,
  );
}

async function serviceRestJson(path, options = {}, expectedStatuses = [200]) {
  return requestJson(
    `${restUrl}${path}`,
    {
      ...options,
      headers: serviceHeaders({
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      }),
    },
    expectedStatuses,
  );
}

async function deleteCreatedUsers() {
  const failures = [];

  for (const updateId of createdProcessedUpdateIds) {
    try {
      await serviceRestJson(
        `/processed_telegram_updates?update_id=eq.${updateId}`,
        {
          method: 'DELETE',
        },
        [200, 204],
      );
    } catch (error) {
      failures.push(error);
    }
  }

  for (const userId of createdUserIds) {
    try {
      await request(
        `${authUrl}/admin/users/${userId}`,
        { method: 'DELETE', headers: serviceHeaders() },
        [200, 204],
      );
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Failed to delete ${failures.length} hosted test fixture(s)`,
    );
  }
  cleanupCompleted = true;
}

async function verifyCleanup() {
  const userFilter = createdUserIds.join(',');
  const updateFilter = createdProcessedUpdateIds.join(',');
  const authUsers = await requestJson(
    `${authUrl}/admin/users?page=1&per_page=1000`,
    { headers: serviceHeaders() },
  );
  const profiles = await requestJson(
    `${restUrl}/profiles?user_id=in.(${userFilter})&select=user_id`,
    { headers: serviceHeaders() },
  );
  const notes = await requestJson(
    `${restUrl}/notes?user_id=in.(${userFilter})&select=id`,
    { headers: serviceHeaders() },
  );
  const processedUpdates = await requestJson(
    `${restUrl}/processed_telegram_updates?update_id=in.(${updateFilter})&select=update_id`,
    { headers: serviceHeaders() },
  );
  assert(
    Array.isArray(authUsers?.users),
    'Auth admin list response was invalid',
  );
  assert(
    createdUserIds.every(
      (userId) => !authUsers.users.some((user) => user.id === userId),
    ),
    'Hosted test Auth users were not removed',
  );
  assert(profiles.length === 0, 'Hosted test profiles were not removed');
  assert(notes.length === 0, 'Hosted test notes were not removed');
  assert(
    processedUpdates.length === 0,
    'Hosted processed-update fixtures were not removed',
  );
}

async function run() {
  const userA = await createUser('a');
  const userB = await createUser('b');
  const tokenA = await signIn(userA);
  const tokenB = await signIn(userB);

  const profileA = await restJson(
    `/profiles?user_id=eq.${userA.id}&select=user_id`,
    tokenA,
  );
  const profileB = await restJson(
    `/profiles?user_id=eq.${userB.id}&select=user_id`,
    tokenB,
  );
  assert(
    profileA.length === 1 && profileB.length === 1,
    'Signup profiles are missing',
  );
  console.log('PASS: password sign-in and automatic profiles');

  const noteAId = randomUUID();
  const noteBId = randomUUID();
  const noteARequestId = randomUUID();
  const noteBRequestId = randomUUID();
  const noteFields = {
    note_type: 'observation',
    summary: 'Synthetic hosted Phase 1 verification.',
    tags: ['hosted', 'testing'],
    recall_prompt: 'What does this synthetic fixture verify?',
    capture_channel: 'web',
  };

  await restJson(
    '/notes',
    tokenA,
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        ...noteFields,
        id: noteAId,
        user_id: userA.id,
        client_request_id: noteARequestId,
        original_text: 'Synthetic hosted note A.',
        embedding: unitVector(0),
      }),
    },
    [201],
  );
  await restJson(
    '/notes',
    tokenB,
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        ...noteFields,
        id: noteBId,
        user_id: userB.id,
        client_request_id: noteBRequestId,
        original_text: 'Synthetic hosted note B.',
        embedding: unitVector(1),
      }),
    },
    [201],
  );

  const userAOwnRows = await restJson('/notes?select=id,user_id', tokenA);
  const userBCannotSeeA = await restJson(
    `/notes?id=eq.${noteAId}&select=id`,
    tokenB,
  );
  assert(
    userAOwnRows.length === 1 &&
      userAOwnRows.every((note) => note.user_id === userA.id),
    'User A note selection was not isolated',
  );
  assert(userBCannotSeeA.length === 0, 'User B could select user A note');
  console.log('PASS: hosted note selection is isolated');

  const crudNoteId = randomUUID();
  await restJson(
    '/notes',
    tokenA,
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        ...noteFields,
        id: crudNoteId,
        user_id: userA.id,
        client_request_id: randomUUID(),
        original_text: '  Synthetic\n hosted\tCRUD note.  ',
      }),
    },
    [201],
  );
  const normalized = await restJson(
    `/notes?id=eq.${crudNoteId}&select=original_text`,
    tokenA,
  );
  assert(
    normalized[0]?.original_text === 'Synthetic hosted CRUD note.',
    'Original text whitespace was not normalized',
  );

  const reviewEventId = randomUUID();
  await restJson(
    '/review_events',
    tokenA,
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        id: reviewEventId,
        user_id: userA.id,
        note_id: crudNoteId,
        stage: 1,
        due_on: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      }),
    },
    [201],
  );
  const updated = await restJson(`/notes?id=eq.${crudNoteId}`, tokenA, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ summary: 'Updated synthetic hosted verification.' }),
  });
  assert(updated.length === 1, 'User A could not update its owned note');
  await restJson(`/notes?id=eq.${crudNoteId}`, tokenA, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  const cascadedReview = await restJson(
    `/review_events?id=eq.${reviewEventId}&select=id`,
    tokenA,
  );
  assert(
    cascadedReview.length === 0,
    'Review event did not cascade on note deletion',
  );
  console.log('PASS: hosted CRUD, normalization, and review cascade');

  const serviceReviewId = randomUUID();
  const digestId = randomUUID();
  const linkCodeId = randomUUID();
  const processedUpdateId =
    Date.now() * 1_000 + Math.floor(Math.random() * 1_000);
  createdProcessedUpdateIds.push(processedUpdateId);
  const createdAt = new Date();

  await serviceRestJson(`/profiles?user_id=eq.${userA.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ timezone: 'Asia/Kolkata' }),
  });
  await serviceRestJson(
    '/review_events',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        id: serviceReviewId,
        user_id: userA.id,
        note_id: noteAId,
        stage: 2,
        due_on: new Date(Date.now() + 172_800_000).toISOString().slice(0, 10),
      }),
    },
    [201],
  );
  await serviceRestJson(
    '/daily_digests',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        id: digestId,
        user_id: userA.id,
        digest_date: createdAt.toISOString().slice(0, 10),
        note_ids: [noteAId],
        content: { fixture: 'phase-1-hosted-verification' },
      }),
    },
    [201],
  );
  await serviceRestJson(`/daily_digests?id=eq.${digestId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ sent_at: createdAt.toISOString() }),
  });
  await serviceRestJson(
    '/telegram_link_codes',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        id: linkCodeId,
        user_id: userA.id,
        code_hash: `phase-1-${randomUUID()}`,
        created_at: createdAt.toISOString(),
        expires_at: new Date(createdAt.getTime() + 300_000).toISOString(),
      }),
    },
    [201],
  );
  await serviceRestJson(
    '/processed_telegram_updates',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ update_id: processedUpdateId }),
    },
    [201],
  );

  const serviceRows = await Promise.all([
    serviceRestJson(`/review_events?id=eq.${serviceReviewId}&select=id`),
    serviceRestJson(`/daily_digests?id=eq.${digestId}&select=id`),
    serviceRestJson(`/telegram_link_codes?id=eq.${linkCodeId}&select=id`),
    serviceRestJson(
      `/processed_telegram_updates?update_id=eq.${processedUpdateId}&select=update_id`,
    ),
  ]);
  assert(
    serviceRows.every((rows) => rows.length === 1),
    'Service role could not select every server workflow fixture',
  );

  await Promise.all([
    serviceRestJson(
      `/review_events?id=eq.${serviceReviewId}`,
      { method: 'DELETE' },
      [200, 204],
    ),
    serviceRestJson(
      `/daily_digests?id=eq.${digestId}`,
      { method: 'DELETE' },
      [200, 204],
    ),
    serviceRestJson(
      `/telegram_link_codes?id=eq.${linkCodeId}`,
      { method: 'DELETE' },
      [200, 204],
    ),
    serviceRestJson(
      `/processed_telegram_updates?update_id=eq.${processedUpdateId}`,
      { method: 'DELETE' },
      [200, 204],
    ),
  ]);
  console.log('PASS: hosted service role can operate on every Phase 1 table');

  await restJson(
    '/notes',
    tokenA,
    {
      method: 'POST',
      body: JSON.stringify({
        ...noteFields,
        id: randomUUID(),
        user_id: userA.id,
        client_request_id: noteARequestId,
        original_text: 'Synthetic duplicate request.',
      }),
    },
    [409],
  );
  console.log('PASS: hosted capture idempotency');

  const matchesA = await restJson('/rpc/match_notes', tokenA, {
    method: 'POST',
    body: JSON.stringify({ query_embedding: unitVector(0), match_count: 20 }),
  });
  const matchesB = await restJson('/rpc/match_notes', tokenB, {
    method: 'POST',
    body: JSON.stringify({ query_embedding: unitVector(0), match_count: 20 }),
  });
  assert(
    matchesA.length === 1 && matchesA[0]?.note_id === noteAId,
    'User A vector search returned an unexpected note set',
  );
  assert(
    matchesB.length === 1 && matchesB[0]?.note_id === noteBId,
    'User B vector search returned an unexpected note set',
  );
  console.log('PASS: hosted match_notes is caller-scoped');

  await restJson('/notes?select=id', null, {}, [401, 403]);
  await restJson(
    '/rpc/normalize_whitespace',
    null,
    {
      method: 'POST',
      body: JSON.stringify({ input_text: 'synthetic' }),
    },
    [401, 403],
  );
  console.log('PASS: hosted anonymous table and helper RPC access is denied');
}

let verificationError;
try {
  await run();
} catch (error) {
  verificationError = error;
} finally {
  try {
    await deleteCreatedUsers();
    await verifyCleanup();
    console.log('PASS: hosted test accounts and rows were removed');
  } catch (cleanupError) {
    if (verificationError) {
      verificationError = new AggregateError(
        [verificationError, cleanupError],
        'Hosted verification and cleanup both failed',
      );
    } else {
      verificationError = cleanupError;
    }
  }
}

if (verificationError) throw verificationError;
assert(cleanupCompleted, 'Hosted cleanup did not complete');
console.log('Phase 1 hosted verification passed.');
