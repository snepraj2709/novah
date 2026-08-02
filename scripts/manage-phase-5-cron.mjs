import { execFileSync } from 'node:child_process';

const EXPECTED_PROJECT_REF = 'fqinppulljqefbvukcpg';
const EXPECTED_SCHEDULE = '*/10 * * * *';
const action = process.argv[2] ?? 'status';
const supabaseUrl = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const restUrl = `${supabaseUrl}/rest/v1`;
const functionsUrl = `${supabaseUrl}/functions/v1`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
      'Unable to load the Novah service-role key from the authenticated Supabase CLI',
    );
  }
}

const serviceRoleKey = loadServiceRoleKey();

function serviceHeaders(extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function rpc(name, body = {}) {
  const response = await fetch(`${restUrl}/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`RPC ${name} returned HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

async function status() {
  const rows = await rpc('notification_cron_status');
  assert(Array.isArray(rows), 'Cron status response is invalid');
  return rows;
}

async function assertFunctionAcceptsSecret(cronSecret) {
  const response = await fetch(`${functionsUrl}/process-notifications`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ probe: true }),
  });
  assert(
    response.ok,
    `process-notifications authenticated probe returned HTTP ${response.status}; synchronize the Edge Function CRON_SECRET before configuring Cron`,
  );
  const payload = await response.json();
  assert(
    payload?.ok === true && payload?.probe === true,
    'process-notifications authenticated probe returned an invalid response',
  );
}

async function configure() {
  assert(
    process.env.NOVAH_APPROVE_PHASE5_CRON_WRITE === EXPECTED_PROJECT_REF,
    'Set NOVAH_APPROVE_PHASE5_CRON_WRITE to the exact Novah project reference after explicit approval',
  );
  const cronSecret = process.env.CRON_SECRET;
  assert(
    typeof cronSecret === 'string' &&
      cronSecret.length >= 32 &&
      cronSecret.length <= 256 &&
      !/\s/u.test(cronSecret),
    'CRON_SECRET must be a non-whitespace value between 32 and 256 characters',
  );
  await assertFunctionAcceptsSecret(cronSecret);
  await rpc('configure_notification_cron', {
    input_cron_secret: cronSecret,
  });
  const rows = await status();
  assert(rows.length === 1, 'Expected exactly one notification Cron job');
  assert(rows[0].schedule === EXPECTED_SCHEDULE, 'Cron schedule is incorrect');
  assert(rows[0].active === true, 'Cron job is not active');
  assert(
    rows[0].secret_exposed === false,
    'Cron job command exposes its secret',
  );
  return rows;
}

async function remove() {
  assert(
    process.env.NOVAH_APPROVE_PHASE5_CRON_REMOVAL === EXPECTED_PROJECT_REF,
    'Set NOVAH_APPROVE_PHASE5_CRON_REMOVAL to the exact Novah project reference after explicit approval',
  );
  await rpc('remove_notification_cron');
  const rows = await status();
  assert(rows.length === 0, 'Notification Cron job still exists');
  return rows;
}

let rows;
if (action === 'configure') rows = await configure();
else if (action === 'remove') rows = await remove();
else if (action === 'status') rows = await status();
else throw new Error('Use one of: configure, status, remove');

const lastRuns =
  action === 'status' ? await rpc('notification_cron_last_run') : [];
const lastDispatch = lastRuns[0] ?? null;

console.log(
  JSON.stringify({
    project: 'Novah',
    action,
    jobCount: rows.length,
    ...(rows.length === 1
      ? {
          schedule: rows[0].schedule,
          active: rows[0].active,
          secretExposed: rows[0].secret_exposed,
          lastDispatch: lastDispatch
            ? {
                status: lastDispatch.status,
                startedAt: lastDispatch.started_at,
                endedAt: lastDispatch.ended_at,
              }
            : null,
        }
      : {}),
    secretsPrinted: false,
  }),
);
