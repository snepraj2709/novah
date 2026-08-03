import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'apps/extension/.output/chrome-mv3-store');
const zip = join(root, 'release/chrome-web-store/novah-0.1.0-chrome.zip');
const manifest = JSON.parse(
  readFileSync(join(output, 'manifest.json'), 'utf8'),
);

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'Novah');
assert.equal(manifest.version, '0.1.0');
assert.ok(manifest.description.length <= 132);
assert.deepEqual(
  [...manifest.permissions].sort(),
  ['activeTab', 'contextMenus', 'sidePanel', 'storage'].sort(),
);
assert.deepEqual(manifest.host_permissions, [
  'https://fqinppulljqefbvukcpg.supabase.co/*',
]);
assert.equal(manifest.side_panel.default_path, 'sidepanel.html');
assert.equal(manifest.background.service_worker, 'background.js');
assert.equal(manifest.content_scripts, undefined);
assert.equal(
  manifest.key,
  undefined,
  'Chrome Web Store upload packages must not contain a manifest key',
);

function pngDimensions(path) {
  const header = readFileSync(path).subarray(0, 24);
  assert.equal(header.toString('ascii', 1, 4), 'PNG');
  assert.equal(header.toString('ascii', 12, 16), 'IHDR');
  return [header.readUInt32BE(16), header.readUInt32BE(20)];
}

function pngColorType(path) {
  const header = readFileSync(path).subarray(0, 26);
  assert.equal(header.toString('ascii', 12, 16), 'IHDR');
  return header.readUInt8(25);
}

for (const size of [16, 32, 48, 128]) {
  assert.deepEqual(pngDimensions(join(output, `icon/${size}.png`)), [
    size,
    size,
  ]);
}

assert.deepEqual(
  pngDimensions(join(root, 'release/chrome-web-store/promo-tile.png')),
  [440, 280],
);
assert.deepEqual(
  pngDimensions(join(root, 'release/chrome-web-store/marquee-promo.png')),
  [1400, 560],
);

const storeScreenshots = [
  'store-01-save-to-novah.png',
  'store-02-review-selection.png',
  'store-03-recall-result.png',
];
for (const screenshot of storeScreenshots) {
  const path = join(root, 'release/chrome-web-store/screenshots', screenshot);
  assert.deepEqual(pngDimensions(path), [1280, 800]);
  assert.equal(
    pngColorType(path),
    2,
    `${screenshot} must be an RGB PNG without transparency`,
  );
}

function filesUnder(directory) {
  const result = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) result.push(...filesUnder(path));
    else result.push(path);
  }
  return result;
}

const packagedFiles = filesUnder(output);
const packagedNames = packagedFiles.map((path) => relative(output, path));
for (const name of packagedNames) {
  assert.doesNotMatch(name, /(?:^|\/)\.DS_Store$/u);
  assert.doesNotMatch(name, /(?:^|\/)\.env(?:\.|$)/u);
  assert.doesNotMatch(name, /\.map$/u);
  assert.notEqual(name, 'wxt.svg');
}

const executableText = packagedFiles
  .filter((path) => ['.js', '.html', '.json'].includes(extname(path)))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

for (const secretName of [
  'OPENAI_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'CRON_SECRET',
]) {
  assert.equal(
    executableText.includes(secretName),
    false,
    `${secretName} leaked`,
  );
}

for (const remoteCodePattern of [
  /\beval\s*\(/u,
  /\bnew\s+Function\s*\(/u,
  /import\s*\(\s*['"]https?:\/\//u,
  /<script[^>]+src\s*=\s*['"]https?:\/\//iu,
]) {
  assert.doesNotMatch(executableText, remoteCodePattern);
}

const zipEntries = execFileSync('unzip', ['-Z1', zip], {
  encoding: 'utf8',
})
  .trim()
  .split('\n');
assert.ok(zipEntries.includes('manifest.json'));
assert.equal(
  zipEntries.some((entry) => entry.endsWith('/manifest.json')),
  false,
);
assert.equal(
  zipEntries.some((entry) => entry.includes('__MACOSX')),
  false,
);
assert.equal(
  zipEntries.some((entry) => entry.endsWith('.DS_Store')),
  false,
);
assert.equal(
  zipEntries.some((entry) => entry.endsWith('.map')),
  false,
);
assert.equal(
  zipEntries.some((entry) => entry === 'wxt.svg'),
  false,
);

console.log(
  JSON.stringify({
    manifestVersion: manifest.manifest_version,
    extensionVersion: manifest.version,
    packagedFiles: packagedNames.length,
    zipEntries: zipEntries.length,
    permissions: manifest.permissions,
    hostPermissions: manifest.host_permissions,
    remoteExecutableCode: false,
    privilegedSecrets: false,
    storeAssets: [
      '128x128',
      '440x280',
      '1400x560',
      `${storeScreenshots.length}x1280x800`,
    ],
  }),
);
