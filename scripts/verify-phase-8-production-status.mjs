import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const EXPECTED_PROJECT_REF = 'fqinppulljqefbvukcpg';
const EXPECTED_PROJECT_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const EXPECTED_EXTENSION_ID = 'illdnfhcgdhkgbifepbejobplgikmmlp';
const EXPECTED_FUNCTION_AUTH = new Map([
  ['capture-note', true],
  ['delete-account', true],
  ['manage-practice', true],
  ['process-notifications', false],
  ['search-notes', true],
  ['telegram-link-code', true],
  ['telegram-webhook', false],
]);
const EXPECTED_MIGRATIONS = [
  '20260801163111',
  '20260801195336',
  '20260801205645',
  '20260802004240',
  '20260802030000',
  '20260802120000',
  '20260802160000',
  '20260803004000',
  '20260803090000',
  '20260803160000',
  '20260804100000',
];
const EXPECTED_SECRET_NAMES = new Set([
  'ALLOWED_EXTENSION_IDS',
  'APP_URL',
  'CRON_SECRET',
  'OPENAI_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
]);
const SERVER_ONLY_ENV = [
  'CRON_SECRET',
  'OPENAI_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
];
const webUrl = normalizedProductionUrl(process.env.NOVAH_PHASE8_WEB_URL);

function normalizedProductionUrl(value) {
  assert(value, 'NOVAH_PHASE8_WEB_URL is required');
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', 'Production web URL must use HTTPS');
  assert.equal(
    url.username,
    '',
    'Production web URL must not contain credentials',
  );
  assert.equal(
    url.password,
    '',
    'Production web URL must not contain credentials',
  );
  assert.equal(url.search, '', 'Production web URL must not contain a query');
  assert.equal(url.hash, '', 'Production web URL must not contain a fragment');
  assert.equal(url.pathname, '/', 'Production web URL must be an origin only');
  assert(
    url.hostname === 'novah.vercel.app' ||
      /^novah(?:-[a-z0-9]+)+\.vercel\.app$/u.test(url.hostname),
    'Production web URL must be the Novah Vercel origin',
  );
  return url.origin;
}

function execText(file, args) {
  return execFileSync(file, args, {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function execJson(file, args) {
  const output = execText(file, args).trim();
  const line = output
    .split(/\r?\n/u)
    .reverse()
    .find((candidate) => candidate.trim().startsWith('{'));
  assert(line, `${file} did not return JSON`);
  return JSON.parse(line);
}

function dotenvValue(source, name) {
  const line = source
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith(`${name}=`));
  assert(line, `.env is missing ${name}`);
  let value = line.slice(name.length + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  assert(value, `.env ${name} is empty`);
  return value;
}

async function projectKeys() {
  const keys = JSON.parse(
    execText('pnpm', [
      'exec',
      'supabase',
      'projects',
      'api-keys',
      '--project-ref',
      EXPECTED_PROJECT_REF,
      '--output',
      'json',
    ]),
  );
  const publishable = keys.find((key) => key.type === 'publishable');
  assert(publishable?.api_key, 'Hosted publishable key is unavailable');
  return { publishableKey: publishable.api_key };
}

async function verifyWeb() {
  const [root, privacy] = await Promise.all([
    fetch(`${webUrl}/`),
    fetch(`${webUrl}/privacy`),
  ]);
  assert.equal(root.status, 200, 'Production root is unavailable');
  assert.equal(privacy.status, 200, 'Production SPA deep link is unavailable');
  const [rootBody, privacyBody] = await Promise.all([
    root.text(),
    privacy.text(),
  ]);
  for (const body of [rootBody, privacyBody]) {
    assert.match(body, /<title>Novah — Private knowledge practice<\/title>/u);
    assert.match(body, /<div id="root"><\/div>/u);
  }
  const expectedHeaders = new Map([
    ['content-security-policy', EXPECTED_PROJECT_REF],
    ['permissions-policy', 'microphone=()'],
    ['referrer-policy', 'no-referrer'],
    ['strict-transport-security', 'max-age=63072000'],
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
  ]);
  for (const [name, expected] of expectedHeaders) {
    assert(
      root.headers.get(name)?.includes(expected),
      `Production response is missing ${name}`,
    );
  }
}

async function verifyCors(publishableKey) {
  const allowedOrigins = [
    webUrl,
    `chrome-extension://${EXPECTED_EXTENSION_ID}`,
  ];
  const userFunctions = [
    'capture-note',
    'delete-account',
    'manage-practice',
    'search-notes',
    'telegram-link-code',
  ];
  for (const slug of userFunctions) {
    for (const origin of allowedOrigins) {
      const response = await fetch(
        `${EXPECTED_PROJECT_URL}/functions/v1/${slug}`,
        {
          method: 'OPTIONS',
          headers: {
            apikey: publishableKey,
            Origin: origin,
            'Access-Control-Request-Headers': 'authorization,content-type',
            'Access-Control-Request-Method': 'POST',
          },
        },
      );
      assert(
        response.status === 200 || response.status === 204,
        `${slug} denied an allowed CORS preflight`,
      );
      assert.equal(
        response.headers.get('access-control-allow-origin'),
        origin,
        `${slug} returned an incorrect CORS origin`,
      );
    }
    const hostile = await fetch(
      `${EXPECTED_PROJECT_URL}/functions/v1/${slug}`,
      {
        method: 'OPTIONS',
        headers: {
          apikey: publishableKey,
          Origin: 'https://novah.example.invalid',
          'Access-Control-Request-Headers': 'authorization,content-type',
          'Access-Control-Request-Method': 'POST',
        },
      },
    );
    assert.equal(hostile.status, 403, `${slug} accepted a hostile origin`);
    assert.equal(
      hostile.headers.get('access-control-allow-origin'),
      null,
      `${slug} reflected a hostile origin`,
    );
  }
}

async function verifyTelegram(dotenv) {
  const botToken = dotenvValue(dotenv, 'TELEGRAM_BOT_TOKEN');
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/getWebhookInfo`,
  );
  const payload = await response.json();
  assert(response.ok && payload.ok, 'Telegram webhook inspection failed');
  const webhook = payload.result ?? {};
  assert.equal(
    webhook.url,
    `${EXPECTED_PROJECT_URL}/functions/v1/telegram-webhook`,
    'Telegram webhook URL is incorrect',
  );
  assert.equal(webhook.pending_update_count, 0, 'Telegram has pending updates');
  assert(!webhook.last_error_message, 'Telegram reports a webhook error');
}

const [dotenv, projectLinkSource] = await Promise.all([
  readFile(new URL('../.env', import.meta.url), 'utf8'),
  readFile(new URL('../.vercel/project.json', import.meta.url), 'utf8'),
]);
const projectLink = JSON.parse(projectLinkSource);
assert.equal(
  projectLink.projectName,
  'novah',
  'Local Vercel link is not Novah',
);
assert(projectLink.projectId && projectLink.orgId, 'Vercel link is incomplete');

const migrations = execJson('pnpm', ['exec', 'supabase', 'migration', 'list']);
assert.deepEqual(
  migrations.migrations.map((migration) => migration.local),
  EXPECTED_MIGRATIONS,
);
assert.deepEqual(
  migrations.migrations.map((migration) => migration.remote),
  EXPECTED_MIGRATIONS,
);

const functions = execJson('pnpm', [
  'exec',
  'supabase',
  'functions',
  'list',
  '--project-ref',
  EXPECTED_PROJECT_REF,
]);
assert.equal(functions.functions.length, EXPECTED_FUNCTION_AUTH.size);
for (const [slug, verifyJwt] of EXPECTED_FUNCTION_AUTH) {
  const deployed = functions.functions.find((entry) => entry.slug === slug);
  assert(deployed, `${slug} is not deployed`);
  assert.equal(deployed.status, 'ACTIVE', `${slug} is not active`);
  assert.equal(deployed.verify_jwt, verifyJwt, `${slug} JWT mode drifted`);
}

const secrets = JSON.parse(
  execText('pnpm', [
    'exec',
    'supabase',
    'secrets',
    'list',
    '--project-ref',
    EXPECTED_PROJECT_REF,
    '--output',
    'json',
  ]),
);
const secretNames = new Set(secrets.map((secret) => secret.name));
for (const name of EXPECTED_SECRET_NAMES) {
  assert(secretNames.has(name), `Supabase Edge environment is missing ${name}`);
}

const cron = execJson('pnpm', ['phase5:cron:status']);
assert.equal(cron.jobCount, 1);
assert.equal(cron.schedule, '*/10 * * * *');
assert.equal(cron.active, true);
assert.equal(cron.secretExposed, false);
assert.equal(cron.lastDispatch?.status, 'succeeded');

const vercelEnvironment = execText('vercel', ['env', 'ls', 'production']);
for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
  assert(vercelEnvironment.includes(name), `Vercel is missing ${name}`);
}
for (const name of SERVER_ONLY_ENV) {
  assert(!vercelEnvironment.includes(name), `Vercel exposes ${name}`);
}

const { publishableKey } = await projectKeys();
await Promise.all([
  verifyWeb(),
  verifyCors(publishableKey),
  verifyTelegram(dotenv),
]);

console.log(
  JSON.stringify({
    project: 'Novah',
    phase: 8,
    webProduction: true,
    spaDeepLink: true,
    browserSecurityHeaders: 6,
    vercelPublicVariables: 2,
    vercelServerSecrets: 0,
    migrationParity: EXPECTED_MIGRATIONS.length,
    activeFunctions: EXPECTED_FUNCTION_AUTH.size,
    corsAllowedOrigins: 2,
    corsHostileOriginDenied: true,
    cronHealthy: true,
    telegramWebhookHealthy: true,
    providerCalls: 0,
    telegramMessages: 0,
    secretsPrinted: false,
  }),
);
