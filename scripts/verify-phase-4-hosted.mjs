import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const EXPECTED_PROJECT_REF = 'fqinppulljqefbvukcpg';
const LINK_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{12}$/u;

const cliKeys = loadProjectKeys();
const supabaseUrl = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const publishableKey = findCliKey(cliKeys, (key) => key.type === 'publishable');
const serviceRoleKey = findCliKey(
  cliKeys,
  (key) => key.name === 'service_role',
);
const authUrl = `${supabaseUrl}/auth/v1`;
const restUrl = `${supabaseUrl}/rest/v1`;
const functionsUrl = `${supabaseUrl}/functions/v1`;
const createdUserIds = [];
const observedUpdateIds = [];
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
  if (!match?.api_key) {
    throw new Error('The expected Supabase project API key is unavailable');
  }
  return match.api_key;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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

async function createUser() {
  const user = {
    email: `novah-phase4-${randomUUID()}@example.invalid`,
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
        user_metadata: { fixture: 'novah-phase-4-hosted-verification' },
      }),
    },
    [200, 201],
  );
  assert(payload?.id, 'Auth admin did not return a test-user ID');
  createdUserIds.push(payload.id);
  return { ...user, id: payload.id };
}

async function signIn(user) {
  const payload = await requestJson(`${authUrl}/token?grant_type=password`, {
    method: 'POST',
    headers: publicHeaders(null, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  assert(payload?.access_token, 'Password sign-in did not return a token');
  return payload.access_token;
}

async function restJson(path, headers, options = {}, statuses = [200]) {
  return requestJson(
    `${restUrl}${path}`,
    {
      ...options,
      headers: {
        ...headers,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    },
    statuses,
  );
}

async function rpc(name, body) {
  return restJson(`/rpc/${name}`, serviceHeaders(), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function generateLinkCode(accessToken) {
  return requestJson(`${functionsUrl}/telegram-link-code`, {
    method: 'POST',
    headers: publicHeaders(accessToken, { 'Content-Type': 'application/json' }),
    body: '{}',
  });
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
  for (const updateId of observedUpdateIds) {
    try {
      await restJson(
        `/processed_telegram_updates?update_id=eq.${updateId}`,
        serviceHeaders(),
        { method: 'DELETE' },
        [200, 204],
      );
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Failed to clean ${failures.length} hosted fixture(s)`);
  }
  cleanupCompleted = true;
}

async function verifyCleanup() {
  if (createdUserIds.length === 0) return;
  const userFilter = createdUserIds.join(',');
  const [profiles, linkCodes] = await Promise.all([
    restJson(
      `/profiles?user_id=in.(${userFilter})&select=user_id`,
      serviceHeaders(),
    ),
    restJson(
      `/telegram_link_codes?user_id=in.(${userFilter})&select=id`,
      serviceHeaders(),
    ),
  ]);
  assert(profiles.length === 0, 'Hosted profile fixture remains');
  assert(linkCodes.length === 0, 'Hosted link-code fixture remains');

  for (const updateId of observedUpdateIds) {
    const rows = await restJson(
      `/processed_telegram_updates?update_id=eq.${updateId}&select=update_id`,
      serviceHeaders(),
    );
    assert(rows.length === 0, 'Hosted webhook fixture remains');
  }
}

async function main() {
  const user = await createUser();
  const accessToken = await signIn(user);

  await request(
    `${functionsUrl}/telegram-link-code`,
    {
      method: 'POST',
      headers: publicHeaders(null, { 'Content-Type': 'application/json' }),
      body: '{}',
    },
    [401],
  );

  const issuedAt = Date.now();
  const link = await generateLinkCode(accessToken);
  assert(LINK_CODE_PATTERN.test(link?.code), 'Link-code format is invalid');
  assert(link.connected === false, 'Fresh profile unexpectedly reports linked');
  const expiresIn = new Date(link.expiresAt).getTime() - issuedAt;
  assert(
    expiresIn >= 9 * 60_000 && expiresIn <= 11 * 60_000,
    'Link code does not have a ten-minute expiry',
  );

  const rows = await restJson(
    `/telegram_link_codes?user_id=eq.${user.id}&select=code_hash,expires_at,consumed_at`,
    serviceHeaders(),
  );
  assert(rows.length === 1, 'Link-code generation did not store one row');
  assert(rows[0].code_hash === sha256(link.code), 'Stored link hash is wrong');
  assert(rows[0].code_hash !== link.code, 'Plain link code was persisted');
  assert(rows[0].consumed_at === null, 'Fresh link code is already consumed');

  const invalidResult = await rpc('consume_telegram_link_code', {
    input_code_hash: sha256(`invalid-${randomUUID()}`),
    input_chat_id: 7_000_000_000_001,
  });
  assert(invalidResult === null, 'Invalid link code was accepted');

  const linkedUserId = await rpc('consume_telegram_link_code', {
    input_code_hash: sha256(link.code),
    input_chat_id: 7_000_000_000_001,
  });
  assert(linkedUserId === user.id, 'Valid link code did not link its owner');
  const replayResult = await rpc('consume_telegram_link_code', {
    input_code_hash: sha256(link.code),
    input_chat_id: 7_000_000_000_001,
  });
  assert(replayResult === null, 'Consumed link code was accepted twice');

  const profiles = await restJson(
    `/profiles?user_id=eq.${user.id}&select=telegram_chat_id`,
    serviceHeaders(),
  );
  assert(
    profiles[0]?.telegram_chat_id === 7_000_000_000_001,
    'Linked chat was not stored on the correct profile',
  );
  const secondLink = await generateLinkCode(accessToken);
  assert(secondLink.connected === true, 'Connected status was not returned');

  const expiredHash = sha256(`expired-${randomUUID()}`);
  const createdAt = new Date(Date.now() - 11 * 60_000);
  const expiresAt = new Date(createdAt.getTime() + 10 * 60_000);
  await request(
    `${restUrl}/telegram_link_codes`,
    {
      method: 'POST',
      headers: serviceHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      }),
      body: JSON.stringify({
        user_id: user.id,
        code_hash: expiredHash,
        created_at: createdAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      }),
    },
    [201],
  );
  const expiredResult = await rpc('consume_telegram_link_code', {
    input_code_hash: expiredHash,
    input_chat_id: 7_000_000_000_002,
  });
  assert(expiredResult === null, 'Expired link code was accepted');

  const updateId = Math.floor(Date.now() / 1000) + 1_000_000_000;
  observedUpdateIds.push(updateId);
  await request(
    `${functionsUrl}/telegram-webhook`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'synthetic-invalid-secret',
      },
      body: JSON.stringify({ update_id: updateId }),
    },
    [401],
  );
  const claimedRows = await restJson(
    `/processed_telegram_updates?update_id=eq.${updateId}&select=update_id`,
    serviceHeaders(),
  );
  assert(
    claimedRows.length === 0,
    'Invalid webhook request claimed an update ID',
  );

  console.log(
    JSON.stringify({
      project: 'Novah',
      authenticatedLinkCode: 'passed',
      hashOnlyStorage: 'passed',
      tenMinuteExpiry: 'passed',
      singleUseConsumption: 'passed',
      chatOwnership: 'passed',
      invalidAndExpiredDenial: 'passed',
      invalidWebhookSecretDenial: 'passed',
      modelCalls: 0,
    }),
  );
}

let primaryError;
try {
  await main();
} catch (error) {
  primaryError = error;
} finally {
  try {
    await cleanup();
    await verifyCleanup();
  } catch (cleanupError) {
    if (!primaryError) primaryError = cleanupError;
  }
}

if (primaryError) throw primaryError;
assert(cleanupCompleted, 'Hosted fixture cleanup did not complete');
console.log(JSON.stringify({ cleanup: 'passed' }));
