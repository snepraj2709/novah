import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const EXPECTED_PROJECT_REF = 'fqinppulljqefbvukcpg';
const MAXIMUM_MODEL_CALLS = 5;

const cliKeys = loadProjectKeys();
const supabaseUrl = (
  process.env.NOVAH_TEST_SUPABASE_URL ??
  `https://${EXPECTED_PROJECT_REF}.supabase.co`
).replace(/\/$/u, '');
const publishableKey =
  process.env.NOVAH_TEST_SUPABASE_PUBLISHABLE_KEY ??
  findCliKey(cliKeys, (key) => key.type === 'publishable');
const serviceRoleKey =
  process.env.NOVAH_TEST_SUPABASE_SERVICE_ROLE_KEY ??
  findCliKey(cliKeys, (key) => key.name === 'service_role');

const projectHost = new URL(supabaseUrl).hostname;
if (projectHost !== `${EXPECTED_PROJECT_REF}.supabase.co`) {
  throw new Error(`Refusing to test unexpected Supabase host: ${projectHost}`);
}

const authUrl = `${supabaseUrl}/auth/v1`;
const restUrl = `${supabaseUrl}/rest/v1`;
const functionsUrl = `${supabaseUrl}/functions/v1`;
const createdUserIds = [];
let cleanupCompleted = false;

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

function findCliKey(keys, predicate) {
  const match = keys.find(predicate);
  if (!match?.api_key)
    throw new Error('The expected Supabase project API key is unavailable');
  return match.api_key;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

async function createUser(label) {
  const user = {
    email: `novah-phase2-${label}-${randomUUID()}@example.invalid`,
    password: randomBytes(32).toString('base64url'),
  };
  const payload = await requestJson(
    `${authUrl}/admin/users`,
    {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ...user,
        email_confirm: true,
        user_metadata: { fixture: 'novah-phase-2-hosted-verification' },
      }),
    },
    [200, 201],
  );
  assert(payload?.id, `Auth admin did not return an ID for test user ${label}`);
  createdUserIds.push(payload.id);
  return { ...user, id: payload.id };
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

async function functionJson(name, accessToken, body) {
  return requestJson(`${functionsUrl}/${name}`, {
    method: 'POST',
    headers: publicHeaders(accessToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
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

async function cleanup() {
  const failures = [];
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
  if (failures.length > 0)
    throw new Error(`Failed to delete ${failures.length} hosted fixture(s)`);
  cleanupCompleted = true;
}

async function verifyCleanup() {
  if (createdUserIds.length === 0) return;
  const filter = createdUserIds.join(',');
  const [profiles, notes, reviews] = await Promise.all([
    requestJson(`${restUrl}/profiles?user_id=in.(${filter})&select=user_id`, {
      headers: serviceHeaders(),
    }),
    requestJson(`${restUrl}/notes?user_id=in.(${filter})&select=id`, {
      headers: serviceHeaders(),
    }),
    requestJson(`${restUrl}/review_events?user_id=in.(${filter})&select=id`, {
      headers: serviceHeaders(),
    }),
  ]);
  assert(
    profiles.length === 0 && notes.length === 0 && reviews.length === 0,
    'Hosted fixture cleanup left owned rows',
  );
}

async function main() {
  const userA = await createUser('a');
  const userB = await createUser('b');
  const [tokenA, tokenB] = await Promise.all([signIn(userA), signIn(userB)]);
  const clientRequestId = randomUUID();
  const originalText =
    'Reversible decisions should be made quickly, while irreversible decisions deserve slower analysis.';
  const captureRequest = {
    originalText,
    personalContext:
      'Use reversibility to decide how much analysis a choice deserves.',
    noteType: 'principle',
    sourceTitle: 'Synthetic decision fixture',
    sourceUrl: 'https://example.invalid/novah/phase-2',
    captureChannel: 'web',
    clientRequestId,
  };

  const capture = await functionJson('capture-note', tokenA, captureRequest);
  assert(
    capture?.note?.originalText === originalText,
    'Capture changed the normalized original text',
  );
  assert(
    capture.note.noteType === 'principle',
    'Capture ignored the selected note type',
  );
  assert(
    !('summary' in capture.note) && !('tags' in capture.note),
    'Capture response exposed legacy generated metadata',
  );

  const [storedNotes, reviews] = await Promise.all([
    restJson(
      `/notes?client_request_id=eq.${clientRequestId}&select=id,original_text,personal_context,note_type,summary,tags,recall_prompt`,
      tokenA,
    ),
    restJson(
      `/review_events?note_id=eq.${capture.note.id}&select=stage,due_on&order=stage`,
      tokenA,
    ),
  ]);
  assert(storedNotes.length === 1, 'Capture did not create exactly one note');
  assert(
    storedNotes[0].original_text === originalText,
    'Stored original text changed',
  );
  assert(
    storedNotes[0].summary === null &&
      storedNotes[0].recall_prompt === null &&
      Array.isArray(storedNotes[0].tags) &&
      storedNotes[0].tags.length === 0,
    'New capture did not store null, empty, null legacy metadata',
  );
  assert(
    reviews.length === 5,
    'Capture did not create exactly five review events',
  );

  const retry = await functionJson('capture-note', tokenA, captureRequest);
  assert(
    retry.note.id === capture.note.id,
    'Idempotent retry returned a different note',
  );
  const retryRows = await restJson(
    `/notes?client_request_id=eq.${clientRequestId}&select=id`,
    tokenA,
  );
  assert(retryRows.length === 1, 'Idempotent retry created a duplicate note');

  const recall = await functionJson('search-notes', tokenA, {
    query: 'What did I save about slowing down choices that are hard to undo?',
    limit: 5,
  });
  assert(
    recall.matches.slice(0, 5).some((item) => item.noteId === capture.note.id),
    'Paraphrase did not retrieve the expected note in the top five',
  );
  assert(
    recall.synthesisWithheld === false && recall.answer,
    'Strong retrieval did not produce synthesis',
  );
  const returnedIds = new Set(recall.matches.map((item) => item.noteId));
  assert(
    recall.citations.length > 0 &&
      recall.citations.every((citation) => returnedIds.has(citation.noteId)),
    'Synthesis cited a note outside returned matches',
  );

  const unrelated = await functionJson('search-notes', tokenA, {
    query:
      'What did I save about coral spawning patterns in the South Pacific?',
    limit: 5,
  });
  assert(
    unrelated.synthesisWithheld === true &&
      unrelated.answer === null &&
      unrelated.citations.length === 0,
    'Unrelated retrieval did not withhold synthesis',
  );

  const isolated = await functionJson('search-notes', tokenB, {
    query: originalText,
    limit: 5,
  });
  assert(
    !isolated.matches.some((item) => item.noteId === capture.note.id),
    'Cross-user search leaked user A data',
  );
  assert(
    isolated.synthesisWithheld === true,
    'Empty user B retrieval should withhold synthesis',
  );

  console.log(
    `Phase 2 hosted verification passed with no more than ${MAXIMUM_MODEL_CALLS} model calls.`,
  );
}

try {
  await main();
} finally {
  await cleanup();
  await verifyCleanup();
  if (!cleanupCompleted)
    throw new Error('Hosted fixture cleanup was not confirmed');
}
