import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

describe('shortcut page toast', () => {
  it('renders isolated top-right feedback over the current webpage', async () => {
    const source = await readFile(
      new URL('../lib/page-toast.ts', import.meta.url),
      'utf8',
    );

    assert.match(source, /attachShadow\(\{ mode: 'closed' \}\)/u);
    assert.match(source, /host\.style\.position = 'fixed'/u);
    assert.match(source, /host\.style\.top = '24px'/u);
    assert.match(source, /host\.style\.right = '24px'/u);
    assert.match(source, /host\.style\.zIndex = '2147483647'/u);
    assert.match(source, /setAttribute\('role', 'status'\)/u);
  });

  it('shows the exact success message after shortcut capture', async () => {
    const source = await readFile(
      new URL('../entrypoints/background.ts', import.meta.url),
      'utf8',
    );

    assert.match(
      source,
      /showPageToast\(tabId, 'Saved to Novah', 'success'\)/u,
    );
  });

  it('installs a page listener before the delayed save finishes', async () => {
    const [toastSource, backgroundSource] = await Promise.all([
      readFile(new URL('../lib/page-toast.ts', import.meta.url), 'utf8'),
      readFile(
        new URL('../entrypoints/background.ts', import.meta.url),
        'utf8',
      ),
    ]);

    assert.match(toastSource, /browser\.tabs\.sendMessage/u);
    assert.match(toastSource, /chrome\.runtime\.onMessage\.addListener/u);
    assert.match(backgroundSource, /preparePageToastBridge\(tab\.id\)/u);
    assert.ok(
      backgroundSource.indexOf('preparePageToastBridge(tab.id)') <
        backgroundSource.indexOf('await enqueueDurably(intent)'),
    );
  });
});
