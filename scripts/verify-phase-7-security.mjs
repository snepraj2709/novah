import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.map',
  '.md',
  '.mjs',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

function trackedFiles() {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root },
  )
    .toString()
    .split('\0')
    .filter(Boolean);
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(relative(root, path));
  }
  return files;
}

function textFiles() {
  return [
    ...new Set([
      ...trackedFiles(),
      ...walk(join(root, 'apps/web/dist')),
      ...walk(join(root, 'apps/extension/.output')),
    ]),
  ].filter((path) => textExtensions.has(extname(path)));
}

const credentialPatterns = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/u,
  /\bsb_secret_[A-Za-z0-9_-]{24,}\b/u,
  /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /(?:OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|TELEGRAM_BOT_TOKEN|CRON_SECRET)[ \t]*=[ \t]*["']?(?!env\(|synthetic|test|example|change-me)[^\s"']{12,}/u,
];

const scanned = textFiles();
function containsServiceRoleJwt(text) {
  for (const token of text.matchAll(
    /\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\b/gu,
  )) {
    try {
      const payload = JSON.parse(
        Buffer.from(token[1], 'base64url').toString('utf8'),
      );
      if (payload.role === 'service_role') return true;
    } catch {
      // Not a decodable JWT payload.
    }
  }
  return false;
}

function assertNoCredential(text, label) {
  assert.equal(
    credentialPatterns.some((pattern) => pattern.test(text)) ||
      containsServiceRoleJwt(text),
    false,
    `credential-like value found in ${label}`,
  );
}

for (const path of scanned) {
  assertNoCredential(readFileSync(join(root, path), 'utf8'), path);
}

const commits = execFileSync('git', ['rev-list', '--all'], { cwd: root })
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean);
let historyFiles = 0;
for (const commit of commits) {
  const paths = execFileSync('git', ['ls-tree', '-rz', '--name-only', commit], {
    cwd: root,
  })
    .toString()
    .split('\0')
    .filter((path) => path && textExtensions.has(extname(path)));
  for (const path of paths) {
    const text = execFileSync('git', ['show', `${commit}:${path}`], {
      cwd: root,
      maxBuffer: 2 * 1024 * 1024,
    }).toString('utf8');
    assertNoCredential(text, `history ${commit.slice(0, 12)}:${path}`);
    historyFiles += 1;
  }
}

const config = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
const expectedJwt = new Map([
  ['capture-note', true],
  ['delete-account', true],
  ['manage-practice', true],
  ['search-notes', true],
  ['telegram-link-code', true],
  ['telegram-webhook', false],
  ['process-notifications', false],
]);
for (const [name, verifyJwt] of expectedJwt) {
  const section = new RegExp(
    `\\[functions\\.${name}\\]\\s+verify_jwt\\s*=\\s*${verifyJwt}`,
    'u',
  );
  assert.match(config, section, `${name} JWT boundary drifted`);
  if (verifyJwt) {
    const entry = readFileSync(
      join(root, `supabase/functions/${name}/index.ts`),
      'utf8',
    );
    assert.ok(
      entry.includes('SupabaseRequestContext'),
      `${name} user-scoped request context is missing`,
    );
  }
}

for (const handler of [
  'capture-handler.ts',
  'account-deletion-handler.ts',
  'practice-handler.ts',
  'search-handler.ts',
  'telegram-link-handler.ts',
]) {
  const source = readFileSync(
    join(root, `supabase/functions/_shared/${handler}`),
    'utf8',
  );
  assert.match(source, /authenticator\.authenticate\(request\)/u);
}

const internalBoundaries = [
  ['telegram-webhook', 'X-Telegram-Bot-Api-Secret-Token'],
  ['process-notifications', 'Bearer'],
];

const notificationEntry = readFileSync(
  join(root, 'supabase/functions/process-notifications/index.ts'),
  'utf8',
);
assert.doesNotMatch(
  notificationEntry,
  /OpenAiProvider|openAiApiKey|OPENAI_API_KEY/u,
  'Practice notification worker must not construct a text-model provider',
);

const telegramHandler = readFileSync(
  join(root, 'supabase/functions/_shared/telegram-handler.ts'),
  'utf8',
);
assert.doesNotMatch(
  telegramHandler,
  /command\?\.name === '(?:search|today|review)'/u,
  'retired Telegram commands must not remain routable',
);
for (const [name, marker] of internalBoundaries) {
  const shared = readFileSync(
    join(
      root,
      `supabase/functions/_shared/${name === 'telegram-webhook' ? 'telegram-handler' : 'notification-handler'}.ts`,
    ),
    'utf8',
  );
  assert.ok(shared.includes(marker), `${name} signed boundary is missing`);
}

const functionSources = walk(join(root, 'supabase/functions')).filter(
  (path) => path.endsWith('.ts') && !path.includes('/tests/'),
);
for (const path of functionSources) {
  const text = readFileSync(join(root, path), 'utf8');
  assert.doesNotMatch(
    text,
    /console\.(?:debug|error|info|log|warn)\s*\(/u,
    `production logging found in ${path}`,
  );
  assert.doesNotMatch(
    text,
    /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*/u,
    `wildcard CORS found in ${path}`,
  );
}

console.log(
  `Phase 7 security scan passed (${scanned.length} repository/build text files, ${historyFiles} historical file revisions, ${expectedJwt.size} function boundaries).`,
);
