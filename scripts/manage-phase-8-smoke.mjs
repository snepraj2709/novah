import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const EXPECTED_PROJECT_REF = 'fqinppulljqefbvukcpg';
const EXPECTED_PROJECT_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const ACCOUNT_GUARD = 'NOVAH_APPROVE_PHASE8_ACCOUNT_WRITE';
const TELEGRAM_GUARD = 'NOVAH_APPROVE_PHASE8_TELEGRAM_REBIND';
const REVIEW_GUARD = 'NOVAH_APPROVE_PHASE8_REVIEW_WRITE';
const STATE_PATH = resolve('.novah-private/phase-8-smoke.json');
const MODE = process.argv[2];
const VALID_MODES = new Set([
  'cleanup',
  'create',
  'review-prepare',
  'status',
  'telegram-prepare',
  'telegram-restore',
]);

assert(
  VALID_MODES.has(MODE),
  `Expected one of: ${[...VALID_MODES].join(', ')}`,
);

function assertGuard(name) {
  assert.equal(
    process.env[name],
    EXPECTED_PROJECT_REF,
    `${name} must equal the exact Novah project reference after explicit approval`,
  );
}

if (MODE === 'create' || MODE === 'cleanup') assertGuard(ACCOUNT_GUARD);
if (MODE === 'telegram-prepare' || MODE === 'telegram-restore') {
  assertGuard(TELEGRAM_GUARD);
}
if (MODE === 'review-prepare') assertGuard(REVIEW_GUARD);

function loadProjectKeys() {
  try {
    return JSON.parse(
      execFileSync(
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
        {
          encoding: 'utf8',
          env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ),
    );
  } catch {
    throw new Error(
      'Unable to load hosted credentials from the authenticated Supabase CLI',
    );
  }
}

function projectKey(keys, predicate, label) {
  const match = keys.find(predicate);
  assert(match?.api_key, `${label} key is unavailable`);
  return match.api_key;
}

const keys = loadProjectKeys();
const serviceRoleKey = projectKey(
  keys,
  (key) => key.name === 'service_role',
  'Service-role',
);
const authUrl = `${EXPECTED_PROJECT_URL}/auth/v1`;
const restUrl = `${EXPECTED_PROJECT_URL}/rest/v1`;

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
  if (response.status === 204) return null;
  return response.json();
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

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_PATH, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        'Phase 8 smoke state is absent; create the fixture first',
      );
    }
    throw error;
  }
}

async function saveState(state) {
  const privateDirectory = dirname(STATE_PATH);
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  await chmod(privateDirectory, 0o700);
  const temporaryPath = `${STATE_PATH}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporaryPath, STATE_PATH);
}

async function create() {
  assertGuard(ACCOUNT_GUARD);
  try {
    await readFile(STATE_PATH);
    throw new Error('Phase 8 smoke state already exists; clean it first');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const credentials = {
    email: `novah-phase8-${randomUUID()}@example.invalid`,
    password: randomBytes(32).toString('base64url'),
  };
  const user = await requestJson(
    `${authUrl}/admin/users`,
    {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ...credentials,
        email_confirm: true,
        user_metadata: { fixture: 'novah-phase-8-production-smoke' },
      }),
    },
    [200, 201],
  );
  assert(user?.id, 'Auth admin did not return a fixture user ID');

  const state = {
    projectRef: EXPECTED_PROJECT_REF,
    createdAt: new Date().toISOString(),
    userId: user.id,
    ...credentials,
  };
  try {
    await saveState(state);
  } catch (error) {
    await request(
      `${authUrl}/admin/users/${user.id}`,
      { method: 'DELETE', headers: serviceHeaders() },
      [200, 204],
    );
    throw error;
  }

  console.log(
    JSON.stringify({
      project: 'Novah',
      action: 'create',
      freshProductionAccount: true,
      credentialsStoredInIgnoredPrivateFile: true,
      identifiersPrinted: false,
      providerCalls: 0,
      telegramMessages: 0,
    }),
  );
}

async function status() {
  const state = await loadState();
  assert.equal(state.projectRef, EXPECTED_PROJECT_REF);

  const [profiles, notes, digests, reviews] = await Promise.all([
    rest(`/profiles?user_id=eq.${state.userId}&select=telegram_chat_id`),
    rest(`/notes?user_id=eq.${state.userId}&select=capture_channel`),
    rest(`/daily_digests?user_id=eq.${state.userId}&select=sent_at`),
    rest(
      `/review_events?user_id=eq.${state.userId}&select=status,sent_at,answered_at`,
    ),
  ]);
  const channels = Object.fromEntries(
    ['extension', 'web', 'telegram_text', 'telegram_voice'].map((channel) => [
      channel,
      notes.filter((note) => note.capture_channel === channel).length,
    ]),
  );

  console.log(
    JSON.stringify({
      project: 'Novah',
      action: 'status',
      fixturePresent: profiles.length === 1,
      telegramLinked: profiles[0]?.telegram_chat_id != null,
      captureChannels: channels,
      digestCount: digests.length,
      sentDigestCount: digests.filter((digest) => digest.sent_at).length,
      reviewCount: reviews.length,
      sentReviewCount: reviews.filter((review) => review.sent_at).length,
      answeredReviewCount: reviews.filter((review) => review.answered_at)
        .length,
      noteBodiesRead: false,
      identifiersPrinted: false,
    }),
  );
}

async function telegramPrepare() {
  assertGuard(TELEGRAM_GUARD);
  const state = await loadState();
  assert(
    !state.originalTelegramBinding,
    'Telegram binding is already prepared',
  );

  const linkedProfiles = await rest(
    '/profiles?telegram_chat_id=not.is.null&select=user_id,telegram_chat_id',
  );
  assert.equal(
    linkedProfiles.length,
    1,
    'Expected exactly one linked tester before temporary smoke-test rebinding',
  );
  const original = linkedProfiles[0];
  assert.notEqual(
    original.user_id,
    state.userId,
    'The smoke account is already the linked tester',
  );

  const preparedState = {
    ...state,
    originalTelegramBinding: {
      userId: original.user_id,
      chatId: original.telegram_chat_id,
      restored: false,
    },
  };
  await saveState(preparedState);
  try {
    await rest(
      `/profiles?user_id=eq.${original.user_id}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ telegram_chat_id: null }),
      },
      [200, 204],
    );
  } catch (error) {
    try {
      await rest(
        `/profiles?user_id=eq.${original.user_id}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ telegram_chat_id: original.telegram_chat_id }),
        },
        [200, 204],
      );
      await saveState(state);
    } catch {
      throw new AggregateError(
        [error],
        'Telegram prepare failed and automatic binding restoration could not be verified; use the preserved private state before retrying',
      );
    }
    throw error;
  }

  const remaining = await rest(
    '/profiles?telegram_chat_id=not.is.null&select=user_id',
  );
  assert.equal(
    remaining.length,
    0,
    'Original Telegram binding was not cleared',
  );
  console.log(
    JSON.stringify({
      project: 'Novah',
      action: 'telegram-prepare',
      originalBindingPreservedPrivately: true,
      linkedProfilesAfter: 0,
      identifiersPrinted: false,
      telegramMessages: 0,
    }),
  );
}

async function restoreTelegram(state) {
  const binding = state.originalTelegramBinding;
  if (!binding || binding.restored) return state;
  assertGuard(TELEGRAM_GUARD);

  await rest(
    `/profiles?user_id=eq.${state.userId}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ telegram_chat_id: null }),
    },
    [200, 204],
  );
  await rest(
    `/profiles?user_id=eq.${binding.userId}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ telegram_chat_id: binding.chatId }),
    },
    [200, 204],
  );
  const linkedProfiles = await rest(
    '/profiles?telegram_chat_id=not.is.null&select=user_id',
  );
  assert.equal(
    linkedProfiles.length,
    1,
    'Telegram binding restore is ambiguous',
  );
  assert.equal(
    linkedProfiles[0].user_id,
    binding.userId,
    'Original Telegram tester was not restored',
  );
  const nextState = {
    ...state,
    originalTelegramBinding: { ...binding, restored: true },
  };
  await saveState(nextState);
  return nextState;
}

async function telegramRestore() {
  const state = await restoreTelegram(await loadState());
  assert(state.originalTelegramBinding?.restored, 'No binding needed restore');
  console.log(
    JSON.stringify({
      project: 'Novah',
      action: 'telegram-restore',
      originalBindingRestored: true,
      identifiersPrinted: false,
      telegramMessages: 0,
    }),
  );
}

function localDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

async function reviewPrepare() {
  assertGuard(REVIEW_GUARD);
  const state = await loadState();
  assert(!state.reviewFixture, 'A smoke review is already prepared');
  const [profiles, reviews] = await Promise.all([
    rest(`/profiles?user_id=eq.${state.userId}&select=timezone`),
    rest(
      `/review_events?user_id=eq.${state.userId}&stage=eq.1&status=eq.pending&select=id,due_on&order=created_at.asc&limit=1`,
    ),
  ]);
  assert.equal(profiles.length, 1, 'Smoke profile is unavailable');
  assert.equal(
    reviews.length,
    1,
    'Capture at least one smoke note before preparing review feedback',
  );
  const dueOn = localDate(new Date(), profiles[0].timezone);
  const preparedState = {
    ...state,
    reviewFixture: {
      eventId: reviews[0].id,
      originalDueOn: reviews[0].due_on,
      preparedDueOn: dueOn,
    },
  };
  await saveState(preparedState);
  await rest(
    `/review_events?id=eq.${reviews[0].id}&user_id=eq.${state.userId}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ due_on: dueOn }),
    },
    [200, 204],
  );
  const dueReviews = await rest(
    `/review_events?id=eq.${reviews[0].id}&user_id=eq.${state.userId}&due_on=lte.${dueOn}&status=eq.pending&select=id`,
  );
  assert.equal(dueReviews.length, 1, 'Smoke review did not become due');
  console.log(
    JSON.stringify({
      project: 'Novah',
      action: 'review-prepare',
      exactlyOneReviewDue: true,
      identifiersPrinted: false,
      providerCalls: 0,
      telegramMessages: 0,
    }),
  );
}

async function cleanup() {
  assertGuard(ACCOUNT_GUARD);
  let state = await loadState();
  state = await restoreTelegram(state);

  await request(
    `${authUrl}/admin/users/${state.userId}`,
    { method: 'DELETE', headers: serviceHeaders() },
    [200, 204, 404],
  );
  const [profiles, notes, digests, reviews] = await Promise.all([
    rest(`/profiles?user_id=eq.${state.userId}&select=user_id`),
    rest(`/notes?user_id=eq.${state.userId}&select=id`),
    rest(`/daily_digests?user_id=eq.${state.userId}&select=id`),
    rest(`/review_events?user_id=eq.${state.userId}&select=id`),
  ]);
  assert.equal(profiles.length, 0, 'Smoke profile remains after cleanup');
  assert.equal(notes.length, 0, 'Smoke notes remain after cleanup');
  assert.equal(digests.length, 0, 'Smoke digest remains after cleanup');
  assert.equal(reviews.length, 0, 'Smoke reviews remain after cleanup');
  await rm(STATE_PATH, { force: true });

  console.log(
    JSON.stringify({
      project: 'Novah',
      action: 'cleanup',
      accountDeleted: true,
      cascadesVerified: true,
      originalTelegramBindingRestored:
        !state.originalTelegramBinding ||
        state.originalTelegramBinding.restored,
      privateCredentialFileRemoved: true,
      identifiersPrinted: false,
    }),
  );
}

if (MODE === 'create') await create();
if (MODE === 'status') await status();
if (MODE === 'telegram-prepare') await telegramPrepare();
if (MODE === 'telegram-restore') await telegramRestore();
if (MODE === 'review-prepare') await reviewPrepare();
if (MODE === 'cleanup') await cleanup();
