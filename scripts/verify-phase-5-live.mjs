import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const EXPECTED_PROJECT_REF = 'fqinppulljqefbvukcpg';
const LIVE_GUARD = 'NOVAH_APPROVE_PHASE5_LIVE_DELIVERY';
const auditCleanupOnly = process.argv.includes('--audit-cleanup');
const preflightOnly = process.argv.includes('--preflight');
const supabaseUrl = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const restUrl = `${supabaseUrl}/rest/v1`;
const functionsUrl = `${supabaseUrl}/functions/v1`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  process.env[LIVE_GUARD] === EXPECTED_PROJECT_REF,
  `Set ${LIVE_GUARD} to the exact Novah project reference after explicit approval`,
);

const cronSecret = process.env.CRON_SECRET;
assert(
  auditCleanupOnly ||
    preflightOnly ||
    (typeof cronSecret === 'string' &&
      cronSecret.length >= 32 &&
      cronSecret.length <= 256 &&
      !/\s/u.test(cronSecret)),
  'CRON_SECRET must be a non-whitespace value between 32 and 256 characters',
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
      'Unable to load live verification credentials from the authenticated Supabase CLI',
    );
  }
}

const serviceRoleKey = loadServiceRoleKey();
const noteId = randomUUID();
const eventId = randomUUID();
let profile = null;
let chosen = null;
let profileChanged = false;
let noteInserted = false;
let reviewInserted = false;
let cleanupComplete = false;

function serviceHeaders(extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function requestJson(url, options = {}, expectedStatuses = [200]) {
  const response = await fetch(url, options);
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `${options.method ?? 'GET'} ${new URL(url).pathname} returned HTTP ${response.status}`,
    );
  }
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

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}:00`,
  };
}

async function loadSoleLinkedProfile() {
  const profiles = await rest(
    '/profiles?telegram_chat_id=not.is.null&select=user_id,timezone,digest_time,review_time',
  );
  assert(
    profiles.length === 1,
    'Live verification requires exactly one linked tester profile',
  );
  profile = profiles[0];
}

async function chooseCleanLocalDate() {
  const now = new Date();
  const noteTimestamps = [];
  for (let offset = 0; ; offset += 1_000) {
    const page = await rest(
      `/notes?user_id=eq.${profile.user_id}&select=captured_at&order=captured_at.asc&limit=1000&offset=${offset}`,
    );
    noteTimestamps.push(...page.map((note) => new Date(note.captured_at)));
    if (page.length < 1_000) break;
  }
  const candidates = [
    'Pacific/Kiritimati',
    'Pacific/Pago_Pago',
    'UTC',
    'Asia/Kolkata',
    'Asia/Dhaka',
  ];
  for (const timezone of candidates) {
    const local = localParts(now, timezone);
    const [digests, reviews] = await Promise.all([
      rest(
        `/daily_digests?user_id=eq.${profile.user_id}&digest_date=eq.${local.date}&select=id`,
      ),
      rest(
        `/review_events?user_id=eq.${profile.user_id}&due_on=lte.${local.date}&status=eq.pending&select=id`,
      ),
    ]);
    const notesExist = noteTimestamps.some(
      (capturedAt) => localParts(capturedAt, timezone).date === local.date,
    );
    if (!notesExist && digests.length === 0 && reviews.length === 0) {
      chosen = { timezone, ...local };
      return;
    }
  }
  throw new Error(
    'No clean current local date exists for a fixture-only live delivery',
  );
}

async function verifyFixtureIsolation() {
  const [notes, reviews] = await Promise.all([
    rest(`/rpc/notification_digest_notes`, {
      method: 'POST',
      body: JSON.stringify({
        input_user_id: profile.user_id,
        input_digest_date: chosen.date,
      }),
    }),
    rest(
      `/review_events?user_id=eq.${profile.user_id}&due_on=lte.${chosen.date}&status=eq.pending&select=id`,
    ),
  ]);
  assert(
    notes.length === 1 && notes[0].note_id === noteId,
    'Live verification requires exactly one synthetic digest note',
  );
  assert(
    reviews.length === 1 && reviews[0].id === eventId,
    'Live verification requires exactly one synthetic due review',
  );
}

async function updateProfile(values) {
  await rest(
    `/profiles?user_id=eq.${profile.user_id}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(values),
    },
    [200, 204],
  );
}

async function insertFixtures() {
  profileChanged = true;
  await updateProfile({
    timezone: chosen.timezone,
    digest_time: chosen.time,
    review_time: chosen.time,
  });
  noteInserted = true;
  await rest(
    '/notes',
    {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: noteId,
        user_id: profile.user_id,
        client_request_id: randomUUID(),
        original_text: 'Synthetic Phase 5 live delivery note.',
        note_type: 'lesson',
        summary: 'Synthetic live delivery summary.',
        tags: ['phase-five', 'live-verification'],
        recall_prompt: 'What did the synthetic live delivery note test?',
        source_title: 'Synthetic live verification',
        capture_channel: 'web',
        captured_at: new Date().toISOString(),
      }),
    },
    [201],
  );
  reviewInserted = true;
  await rest(
    '/review_events',
    {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: eventId,
        user_id: profile.user_id,
        note_id: noteId,
        stage: 1,
        due_on: chosen.date,
      }),
    },
    [201],
  );
}

async function invokeProcessor() {
  return requestJson(`${functionsUrl}/process-notifications`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
}

async function verifyDelivery() {
  const first = await invokeProcessor();
  assert(first.digestsSent === 1, 'Live digest was not delivered exactly once');
  assert(
    first.reviewPacketsSent === 1,
    'Live review packet was not delivered exactly once',
  );
  assert(first.errors === 0, 'Live notification processor reported an error');

  const second = await invokeProcessor();
  assert(second.digestsSent === 0, 'Repeated processing redelivered a digest');
  assert(
    second.reviewPacketsSent === 0,
    'Repeated processing redelivered a review packet',
  );
  assert(second.errors === 0, 'Repeated processor call reported an error');

  const [digests, reviews] = await Promise.all([
    rest(
      `/daily_digests?user_id=eq.${profile.user_id}&digest_date=eq.${chosen.date}&select=id,note_ids,sent_at`,
    ),
    rest(`/review_events?id=eq.${eventId}&select=sent_at,status`),
  ]);
  assert(digests.length === 1, 'Persisted live digest row is missing');
  assert(
    Array.isArray(digests[0].note_ids) &&
      digests[0].note_ids.length === 1 &&
      digests[0].note_ids[0] === noteId,
    'Persisted live digest note evidence is incorrect',
  );
  assert(
    digests[0].sent_at !== null,
    'Persisted live digest is not marked sent',
  );
  assert(
    reviews.length === 1 &&
      reviews[0].status === 'sent' &&
      reviews[0].sent_at !== null,
    'Persisted live review delivery evidence is incomplete',
  );
}

async function auditCleanup() {
  await loadSoleLinkedProfile();
  const [notes, digests] = await Promise.all([
    rest(`/notes?user_id=eq.${profile.user_id}&select=id,tags`),
    rest(`/daily_digests?user_id=eq.${profile.user_id}&select=id,content`),
  ]);
  const syntheticNotes = notes.filter((note) =>
    note.tags.includes('live-verification'),
  );
  const syntheticDigests = digests.filter(
    (digest) =>
      digest.content?.reflectionQuestion ===
      'What did the synthetic live delivery note test?',
  );
  assert(
    syntheticNotes.length === 0 && syntheticDigests.length === 0,
    'Live verification fixtures remain after cleanup',
  );
  console.log(
    JSON.stringify({
      project: 'Novah',
      action: 'audit-cleanup',
      syntheticNotes: 0,
      syntheticDigests: 0,
      identifiersPrinted: false,
    }),
  );
}

if (auditCleanupOnly) {
  await auditCleanup();
  process.exit(0);
}

if (preflightOnly) {
  await loadSoleLinkedProfile();
  await chooseCleanLocalDate();
  console.log(
    JSON.stringify({
      project: 'Novah',
      action: 'preflight',
      soleLinkedTester: 'passed',
      cleanCandidate: 'passed',
      writes: 0,
      modelCalls: 0,
      telegramMessages: 0,
      identifiersPrinted: false,
    }),
  );
  process.exit(0);
}

async function cleanup() {
  const cleanupErrors = [];
  const attempt = async (operation) => {
    try {
      await operation();
    } catch (error) {
      cleanupErrors.push(error);
    }
  };
  if (profile && chosen) {
    await attempt(() =>
      rest(
        `/daily_digests?user_id=eq.${profile.user_id}&digest_date=eq.${chosen.date}`,
        { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
        [200, 204],
      ),
    );
  }
  if (reviewInserted) {
    await attempt(() =>
      rest(
        `/review_events?id=eq.${eventId}`,
        { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
        [200, 204],
      ),
    );
  }
  if (noteInserted) {
    await attempt(() =>
      rest(
        `/notes?id=eq.${noteId}`,
        { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
        [200, 204],
      ),
    );
  }
  if (profileChanged) {
    await attempt(() =>
      updateProfile({
        timezone: profile.timezone,
        digest_time: profile.digest_time,
        review_time: profile.review_time,
      }),
    );
  }
  if (profile) {
    await attempt(async () => {
      const [notes, reviews, digests, profiles] = await Promise.all([
        rest(`/notes?id=eq.${noteId}&select=id`),
        rest(`/review_events?id=eq.${eventId}&select=id`),
        chosen
          ? rest(
              `/daily_digests?user_id=eq.${profile.user_id}&digest_date=eq.${chosen.date}&select=id,note_ids`,
            )
          : [],
        rest(
          `/profiles?user_id=eq.${profile.user_id}&select=timezone,digest_time,review_time`,
        ),
      ]);
      assert(
        notes.length === 0 &&
          reviews.length === 0 &&
          digests.every((digest) => !digest.note_ids.includes(noteId)),
        'Live verification fixtures remain after cleanup',
      );
      assert(
        profiles.length === 1 &&
          profiles[0].timezone === profile.timezone &&
          profiles[0].digest_time === profile.digest_time &&
          profiles[0].review_time === profile.review_time,
        'Live verification profile settings were not restored',
      );
    });
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      'Live verification cleanup did not complete',
    );
  }
  cleanupComplete = true;
}

let failure;
try {
  await loadSoleLinkedProfile();
  await chooseCleanLocalDate();
  await insertFixtures();
  await verifyFixtureIsolation();
  await verifyDelivery();
} catch (error) {
  failure = error;
} finally {
  try {
    await cleanup();
  } catch (cleanupError) {
    failure = failure
      ? new AggregateError(
          [failure, cleanupError],
          'Live verification and cleanup both failed',
        )
      : cleanupError;
  }
}

if (failure) throw failure;
assert(cleanupComplete, 'Live verification cleanup did not complete');

console.log(
  JSON.stringify({
    project: 'Novah',
    soleLinkedTester: 'passed',
    digestDelivery: 'passed',
    reviewPacketDelivery: 'passed',
    retryDeduplication: 'passed',
    settingsRestored: 'passed',
    fixtureCleanup: 'passed',
    modelCalls: 0,
    telegramMessages: 2,
    identifiersPrinted: false,
  }),
);
