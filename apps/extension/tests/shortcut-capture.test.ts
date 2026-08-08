import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { draftFromSelection } from '../lib/draft-model.ts';
import {
  appendShortcutCaptureIntent,
  isResumeShortcutCapturesMessage,
  isSaveSelectionShortcutUnassigned,
  parseShortcutCaptureQueue,
  processShortcutCaptureIntents,
  RESUME_SHORTCUT_CAPTURES_MESSAGE,
  type ShortcutCaptureIntent,
} from '../lib/shortcut-capture.ts';

function intent(id: string, text = id): ShortcutCaptureIntent {
  return {
    draft: draftFromSelection(
      {
        selectionText: text,
        pageTitle: 'A useful page',
        pageUrl: 'https://example.com/article',
      },
      id,
    ),
    tabId: 17,
    windowId: 4,
    createdAt: '2026-08-08T10:00:00.000Z',
  };
}

describe('shortcut capture queue', () => {
  it('validates complete persisted intents and drops invalid entries', () => {
    const valid = intent('request-1');
    assert.deepEqual(
      parseShortcutCaptureQueue([
        valid,
        { ...valid, tabId: -1 },
        { ...valid, createdAt: 'not-a-date' },
        { draft: valid.draft },
      ]),
      [valid],
    );
    assert.deepEqual(parseShortcutCaptureQueue({}), []);
  });

  it('queues rapid captures in order without duplicating an idempotency id', () => {
    const first = intent('request-1', 'First selection');
    const second = intent('request-2', 'Second selection');
    const queue = appendShortcutCaptureIntent(
      appendShortcutCaptureIntent([], first),
      second,
    );
    assert.deepEqual(
      appendShortcutCaptureIntent(queue, first).map(
        (item) => item.draft.clientRequestId,
      ),
      ['request-1', 'request-2'],
    );
  });

  it('processes queued captures sequentially and preserves request ids', async () => {
    const calls: string[] = [];
    const result = await processShortcutCaptureIntents(
      [intent('request-1'), intent('request-2')],
      async (item) => {
        calls.push(item.draft.clientRequestId);
      },
      () => false,
    );
    assert.deepEqual(calls, ['request-1', 'request-2']);
    assert.equal(result.status, 'saved');
    assert.deepEqual(result.remaining, []);
  });

  it('retains the current and later captures when authentication is required', async () => {
    const queue = [intent('request-1'), intent('request-2')];
    const result = await processShortcutCaptureIntents(
      queue,
      async () => {
        throw new Error('signed out');
      },
      () => true,
    );
    assert.equal(result.status, 'needs-auth');
    assert.deepEqual(result.remaining, queue);
  });

  it('isolates a failed draft and leaves later captures queued for retry', async () => {
    const first = intent('request-1');
    const failed = intent('request-2');
    const later = intent('request-3');
    const result = await processShortcutCaptureIntents(
      [first, failed, later],
      async (item) => {
        if (item === failed) throw new Error('network down');
      },
      () => false,
    );
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.saved, [first]);
    assert.equal(result.failed, failed);
    assert.deepEqual(result.remaining, [later]);
  });

  it('recognizes only the typed resume message', () => {
    assert.equal(
      isResumeShortcutCapturesMessage({
        type: RESUME_SHORTCUT_CAPTURES_MESSAGE,
      }),
      true,
    );
    assert.equal(isResumeShortcutCapturesMessage({ type: 'other' }), false);
  });

  it('detects when Chrome left the save shortcut unassigned', () => {
    assert.equal(
      isSaveSelectionShortcutUnassigned([
        { name: 'save-selection-to-novah', shortcut: '' },
      ]),
      true,
    );
    assert.equal(
      isSaveSelectionShortcutUnassigned([
        { name: 'save-selection-to-novah', shortcut: 'Command+Shift+S' },
      ]),
      false,
    );
  });

  it('declares the exact shortcut, scripting permission, and Chrome floor', async () => {
    const source = await readFile(
      new URL('../wxt.config.ts', import.meta.url),
      'utf8',
    );
    assert.match(source, /minimum_chrome_version: '141'/u);
    assert.match(source, /'scripting'/u);
    assert.match(source, /'save-selection-to-novah'/u);
    assert.match(source, /default: 'Ctrl\+Shift\+S'/u);
    assert.match(source, /mac: 'Command\+Shift\+S'/u);
  });

  it('resumes queued captures from an authenticated side panel', async () => {
    const source = await readFile(
      new URL('../entrypoints/sidepanel/App.tsx', import.meta.url),
      'utf8',
    );
    assert.match(source, /RESUME_SHORTCUT_CAPTURES_MESSAGE/u);
    assert.match(source, /browser\.runtime\.sendMessage\(message\)/u);
    assert.match(source, /pendingShortcutCount > 0/u);
    assert.match(source, /Novah’s save shortcut isn’t assigned/u);
    assert.match(source, /dismissShortcutNotice/u);
  });
});
