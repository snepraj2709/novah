import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const EXPECTED_PROJECT_REF = 'fqinppulljqefbvukcpg';
const EXPECTED_PROJECT_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const EXPECTED_EXTENSION_ID = 'illdnfhcgdhkgbifepbejobplgikmmlp';
const PUBLIC_BROWSER_ENV = new Set([
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
]);
const SERVER_ONLY_ENV = new Set([
  'CRON_SECRET',
  'OPENAI_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
]);
const FUNCTION_AUTH = new Map([
  ['capture-note', true],
  ['delete-account', true],
  ['manage-practice', true],
  ['process-notifications', false],
  ['search-notes', true],
  ['telegram-link-code', true],
  ['telegram-webhook', false],
]);

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function environmentKeys(source) {
  return new Set(
    source
      .split(/\r?\n/u)
      .filter((line) => /^[A-Z][A-Z0-9_]*=/u.test(line))
      .map((line) => line.slice(0, line.indexOf('='))),
  );
}

const [
  environmentExample,
  gitignore,
  rootPackageSource,
  supabaseConfig,
  functionEnvironment,
  webConfig,
  extensionConfig,
  extensionWxtConfig,
  rootReadme,
  runbook,
  privacyPolicy,
  privacyPage,
  storeSubmission,
  privateBetaInstallation,
  extensionReadme,
  vercelSource,
  vercelIgnore,
] = await Promise.all([
  text('.env.example'),
  text('.gitignore'),
  text('package.json'),
  text('supabase/config.toml'),
  text('supabase/functions/_shared/environment.ts'),
  text('apps/web/src/lib/config.ts'),
  text('apps/extension/lib/config.ts'),
  text('apps/extension/wxt.config.ts'),
  text('README.md'),
  text('docs/runbook.md'),
  text('docs/privacy-policy.md'),
  text('apps/web/src/pages/PrivacyPage.tsx'),
  text('docs/chrome-web-store-submission.md'),
  text('docs/private-beta-extension-installation.md'),
  text('apps/extension/README.md'),
  text('vercel.json'),
  text('.vercelignore'),
]);

const rootPackage = JSON.parse(rootPackageSource);
const vercel = JSON.parse(vercelSource);
const exampleKeys = environmentKeys(environmentExample);

for (const key of PUBLIC_BROWSER_ENV) {
  assert(exampleKeys.has(key), `.env.example is missing ${key}`);
}
for (const key of [
  'ALLOWED_EXTENSION_IDS',
  'APP_URL',
  'CRON_SECRET',
  'OPENAI_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
]) {
  assert(exampleKeys.has(key), `.env.example is missing ${key}`);
}

assert.equal(
  rootPackage.scripts['test:phase8:config'],
  'node scripts/verify-phase-8-config.mjs',
);
assert.equal(
  rootPackage.scripts['test:phase8:production-status'],
  'node scripts/verify-phase-8-production-status.mjs',
);
assert.match(gitignore, /^\.novah-private\/$/mu);

assert.equal(vercel.framework, 'vite');
assert.equal(vercel.installCommand, 'pnpm install --frozen-lockfile');
assert.equal(vercel.buildCommand, 'pnpm --filter web build');
assert.equal(vercel.outputDirectory, 'apps/web/dist');
assert.deepEqual(vercel.rewrites, [
  { source: '/(.*)', destination: '/index.html' },
]);
assert.equal(vercel.headers?.length, 1);
const responseHeaders = new Map(
  vercel.headers[0].headers.map(({ key, value }) => [key, value]),
);
for (const header of [
  'Content-Security-Policy',
  'Permissions-Policy',
  'Referrer-Policy',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-Frame-Options',
]) {
  assert(responseHeaders.has(header), `Vercel is missing ${header}`);
}
assert.match(
  responseHeaders.get('Content-Security-Policy'),
  new RegExp(EXPECTED_PROJECT_REF, 'u'),
);
for (const key of SERVER_ONLY_ENV) {
  assert(!vercelSource.includes(key), `Vercel config mentions ${key}`);
}
for (const ignoredPath of ['.env', '.env.*', '.novah-private/', '.vercel/']) {
  assert(
    vercelIgnore.split(/\r?\n/u).includes(ignoredPath),
    `Vercel upload ignore is missing ${ignoredPath}`,
  );
}

assert.match(supabaseConfig, /^site_url = "env\(APP_URL\)"$/mu);
assert.match(
  supabaseConfig,
  /^additional_redirect_urls = \["env\(APP_URL\)"\]$/mu,
);
assert.match(supabaseConfig, /^minimum_password_length = 8$/mu);
for (const [name, verifyJwt] of FUNCTION_AUTH) {
  assert.match(
    supabaseConfig,
    new RegExp(`\\[functions\\.${name}\\]\\nverify_jwt = ${verifyJwt}`, 'u'),
  );
}

assert.match(functionEnvironment, /Deno\.env\.get\('APP_URL'\)/u);
assert.match(functionEnvironment, /Deno\.env\.get\('ALLOWED_EXTENSION_IDS'\)/u);
assert(webConfig.includes(EXPECTED_PROJECT_URL));
assert(extensionConfig.includes(EXPECTED_PROJECT_URL));
assert(extensionConfig.includes(EXPECTED_EXTENSION_ID));
const publicKeyMatch = extensionWxtConfig.match(
  /const developmentExtensionPublicKey\s*=\s*'([^']+)'/u,
);
assert(publicKeyMatch, 'development extension public key is missing');
const publicKeyHash = createHash('sha256')
  .update(Buffer.from(publicKeyMatch[1], 'base64'))
  .digest('hex')
  .slice(0, 32);
const derivedExtensionId = [...publicKeyHash]
  .map((character) => String.fromCharCode(97 + Number.parseInt(character, 16)))
  .join('');
assert.equal(derivedExtensionId, EXPECTED_EXTENSION_ID);
assert.match(
  extensionWxtConfig,
  /mode === 'store' \? \{\} : \{ key: developmentExtensionPublicKey \}/u,
);

for (const key of PUBLIC_BROWSER_ENV) {
  assert(runbook.includes(key), `Runbook is missing ${key}`);
}
for (const key of SERVER_ONLY_ENV) {
  assert(runbook.includes(key), `Runbook is missing ${key}`);
}
assert(runbook.includes('.novah-private/phase-8-deployment.md'));

const currentProductCopy = [
  rootReadme,
  runbook,
  privacyPolicy,
  privacyPage,
  storeSubmission,
  privateBetaInstallation,
  extensionReadme,
]
  .join('\n')
  .toLowerCase();
for (const retiredClaim of [
  '/today',
  '/review',
  '/search',
  'daily digest',
  'digest time',
  'review time',
  'spaced review',
  'fixed review',
  'recall tab',
  'web library',
  'web review',
]) {
  assert(
    !currentProductCopy.includes(retiredClaim),
    `Current product copy still contains retired behavior: ${retiredClaim}`,
  );
}

console.log(
  JSON.stringify({
    phase: 8,
    productionProjectPinned: true,
    publicBrowserVariables: PUBLIC_BROWSER_ENV.size,
    serverOnlyVariables: SERVER_ONLY_ENV.size,
    functionAuthorizationModes: FUNCTION_AUTH.size,
    spaFallback: true,
    securityHeaders: responseHeaders.size,
    retiredProductCopyClaims: 0,
    privateRollbackLedgerIgnored: true,
  }),
);
