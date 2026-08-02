import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const EXPECTED_PROJECT_REF = 'fqinppulljqefbvukcpg';
const FIXTURE_GUARD = 'NOVAH_APPROVE_PHASE5_HOSTED_FIXTURES';
const DIGEST_DATE = '2030-01-15';
const supabaseUrl = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const authUrl = `${supabaseUrl}/auth/v1`;
const restUrl = `${supabaseUrl}/rest/v1`;
const functionsUrl = `${supabaseUrl}/functions/v1`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  process.env[FIXTURE_GUARD] === EXPECTED_PROJECT_REF,
  `Set ${FIXTURE_GUARD} to the exact Novah project reference after explicit approval`,
);

function loadServiceRoleKey() {
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
    const keys = JSON.parse(output);
    const serviceRole = keys.find((key) => key.name === 'service_role');
    if (!serviceRole?.api_key) throw new Error('Missing service-role key');
    return serviceRole.api_key;
  } catch {
    throw new Error(
      'Unable to load hosted verification credentials from the authenticated Supabase CLI',
    );
  }
}

const serviceRoleKey = loadServiceRoleKey();
let userId = null;
const targetNoteId = randomUUID();
const adjacentNoteId = randomUUID();
const reviewEventId = randomUUID();
let userCreated = false;
let cleanupComplete = false;

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
    throw new Error(
      `${options.method ?? 'GET'} ${new URL(url).pathname} returned HTTP ${response.status}`,
    );
  }
  return response;
}

async function requestJson(url, options = {}, expectedStatuses = [200]) {
  const response = await request(url, options, expectedStatuses);
  const body = await response.text();
  return body.length === 0 ? null : JSON.parse(body);
}

async function rest(path, options = {}, expectedStatuses = [200]) {
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

async function rpc(name, body = {}) {
  return rest(`/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function createUser() {
  const response = await requestJson(
    `${authUrl}/admin/users`,
    {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        email: `novah-phase5-${randomUUID()}@example.invalid`,
        password: randomBytes(32).toString('base64url'),
        email_confirm: true,
        user_metadata: { fixture: 'novah-phase-5-hosted-verification' },
      }),
    },
    [200, 201],
  );
  assert(response?.id, 'Auth admin did not create the fixture user');
  userId = response.id;
  userCreated = true;
}

async function insertFixtures() {
  await rest(
    `/profiles?user_id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ timezone: 'Asia/Kolkata' }),
    },
    [200, 204],
  );
  await rest(
    '/notes',
    {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([
        {
          id: targetNoteId,
          user_id: userId,
          client_request_id: randomUUID(),
          original_text: 'Synthetic Phase 5 target-date note.',
          note_type: 'lesson',
          summary: 'Synthetic target-date summary.',
          tags: ['phase-five', 'testing'],
          recall_prompt: 'What belonged to the target local date?',
          source_title: 'Synthetic source',
          capture_channel: 'web',
          captured_at: '2030-01-14T19:00:00.000Z',
        },
        {
          id: adjacentNoteId,
          user_id: userId,
          client_request_id: randomUUID(),
          original_text: 'Synthetic adjacent-date note.',
          note_type: 'lesson',
          summary: 'Synthetic adjacent-date summary.',
          tags: ['phase-five', 'testing'],
          recall_prompt: 'What belonged to the adjacent local date?',
          source_title: 'Synthetic source',
          capture_channel: 'web',
          captured_at: '2030-01-14T18:00:00.000Z',
        },
      ]),
    },
    [201],
  );
  await rest(
    '/review_events',
    {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: reviewEventId,
        user_id: userId,
        note_id: targetNoteId,
        stage: 1,
        due_on: DIGEST_DATE,
      }),
    },
    [201],
  );
}

async function verifyContracts() {
  const evidence = await rpc('notification_digest_notes', {
    input_user_id: userId,
    input_digest_date: DIGEST_DATE,
  });
  assert(evidence.length === 1, 'Local-date evidence selection was not exact');
  assert(
    evidence[0].note_id === targetNoteId,
    'Wrong local-date note selected',
  );

  const claimBody = {
    input_user_id: userId,
    input_digest_date: DIGEST_DATE,
    input_note_ids: [targetNoteId],
    input_content: {
      captureCount: 1,
      sourceCount: 1,
      themes: [],
      connection: null,
      reflectionQuestion: 'What belonged to the target local date?',
    },
  };
  const digestClaims = await Promise.all([
    rpc('claim_daily_digest', claimBody),
    rpc('claim_daily_digest', claimBody),
  ]);
  assert(
    digestClaims.filter((value) => typeof value === 'string').length === 1 &&
      digestClaims.filter((value) => value === null).length === 1,
    'Concurrent digest claims did not produce one winner',
  );
  const digests = await rest(
    `/daily_digests?user_id=eq.${userId}&digest_date=eq.${DIGEST_DATE}&select=id,note_ids`,
  );
  assert(digests.length === 1, 'Concurrent claims created duplicate digests');
  assert(
    digests[0].note_ids.length === 1 && digests[0].note_ids[0] === targetNoteId,
    'Stored digest evidence is incorrect',
  );

  const reviewClaims = await Promise.all([
    rpc('claim_due_reviews', {
      input_user_id: userId,
      input_local_date: DIGEST_DATE,
      input_claimed_at: '2030-01-15T03:30:00.000Z',
    }),
    rpc('claim_due_reviews', {
      input_user_id: userId,
      input_local_date: DIGEST_DATE,
      input_claimed_at: '2030-01-15T03:30:00.000Z',
    }),
  ]);
  assert(
    reviewClaims.filter((value) => value.length === 1).length === 1 &&
      reviewClaims.filter((value) => value.length === 0).length === 1,
    'Concurrent review claims did not produce one winner',
  );
  await rpc('mark_review_packet_sent', {
    input_event_ids: [reviewEventId],
    input_sent_at: '2030-01-15T03:30:01.000Z',
  });
  const revealed = await rpc('reveal_review_for_user', {
    input_user_id: userId,
    input_event_id: reviewEventId,
  });
  assert(revealed.length === 1, 'Owning user could not reveal the review');
  const crossUserReveal = await rpc('reveal_review_for_user', {
    input_user_id: randomUUID(),
    input_event_id: reviewEventId,
  });
  assert(crossUserReveal.length === 0, 'Another user could reveal the review');
  assert(
    (await rpc('record_review_feedback_for_user', {
      input_user_id: userId,
      input_event_id: reviewEventId,
      input_status: 'partial',
    })) === true,
    'Owning recall feedback was not recorded',
  );
  assert(
    (await rpc('record_review_feedback_for_user', {
      input_user_id: userId,
      input_event_id: reviewEventId,
      input_status: 'missed',
    })) === false,
    'Repeated feedback overwrote the first answer',
  );
}

async function cleanup() {
  if (!userCreated) return;
  await request(
    `${authUrl}/admin/users/${userId}`,
    { method: 'DELETE', headers: serviceHeaders() },
    [200, 204],
  );
  const [profiles, notes, digests, reviews] = await Promise.all([
    rest(`/profiles?user_id=eq.${userId}&select=user_id`),
    rest(`/notes?user_id=eq.${userId}&select=id`),
    rest(`/daily_digests?user_id=eq.${userId}&select=id`),
    rest(`/review_events?user_id=eq.${userId}&select=id`),
  ]);
  assert(
    profiles.length + notes.length + digests.length + reviews.length === 0,
    'Hosted Phase 5 fixtures remain after cleanup',
  );
  cleanupComplete = true;
}

async function main() {
  await request(
    `${functionsUrl}/process-notifications`,
    { method: 'POST' },
    [401],
  );
  await createUser();
  await insertFixtures();
  await verifyContracts();
}

let failure;
try {
  await main();
} catch (error) {
  failure = error;
} finally {
  try {
    await cleanup();
  } catch (cleanupError) {
    failure = failure
      ? new AggregateError(
          [failure, cleanupError],
          'Hosted verification and cleanup both failed',
        )
      : cleanupError;
  }
}

if (failure) throw failure;
assert(cleanupComplete, 'Hosted cleanup did not complete');

console.log(
  JSON.stringify({
    project: 'Novah',
    processNotificationsAuth: 'passed',
    exactLocalDateEvidence: 'passed',
    concurrentDigestClaim: 'passed',
    concurrentReviewClaim: 'passed',
    ownerScopedCallbacks: 'passed',
    fixtureCleanup: 'passed',
    modelCalls: 0,
    telegramMessages: 0,
    identifiersPrinted: false,
  }),
);
