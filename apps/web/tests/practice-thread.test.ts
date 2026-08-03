import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { PRACTICE_PROMPTS, practicePrompt } from '../src/lib/practice.ts';

const NOTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('Living Reflection Thread', () => {
  it('selects only from the fixed prompt bank deterministically', () => {
    const first = practicePrompt(NOTE_ID, 2);
    assert.equal(first, practicePrompt(NOTE_ID, 2));
    assert.ok(
      PRACTICE_PROMPTS.includes(first as (typeof PRACTICE_PROMPTS)[number]),
    );
    assert.notEqual(first, practicePrompt(NOTE_ID, 3));
  });

  it('keeps prompt selection local with zero provider calls', async () => {
    const source = await readFile(
      new URL('../src/lib/practice.ts', import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(source, /fetch|OpenAI|provider|model/iu);
  });

  it('owns prompt, separate inputs, and chronological thread in the drawer', async () => {
    const [drawer, dashboard, card] = await Promise.all([
      readFile(
        new URL('../src/components/NoteDetailDrawer.tsx', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../src/lib/dashboard.ts', import.meta.url), 'utf8'),
      readFile(
        new URL('../src/components/NoteCard.tsx', import.meta.url),
        'utf8',
      ),
    ]);
    assert.match(drawer, /Give me a prompt/u);
    assert.match(drawer, /addEntry\(event, 'reflection'\)/u);
    assert.match(drawer, /addEntry\(event, 'story'\)/u);
    assert.match(drawer, /Practice thread/u);
    assert.match(drawer, /entry\.text/u);
    assert.doesNotMatch(drawer, /Edit entry|Delete entry/u);
    assert.match(dashboard, /order\('created_at', \{ ascending: true \}\)/u);
    assert.match(dashboard, /order\('id', \{ ascending: true \}\)/u);
    assert.doesNotMatch(card, /entry\.text|practicePrompt|textarea/u);
  });

  it('reuses a stable entry key after an uncertain web retry', async () => {
    const [drawer, api] = await Promise.all([
      readFile(
        new URL('../src/components/NoteDetailDrawer.tsx', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../src/lib/api.ts', import.meta.url), 'utf8'),
    ]);
    assert.match(drawer, /entryRetry/u);
    assert.match(drawer, /crypto\.randomUUID\(\)/u);
    assert.match(drawer, /previousAttempt\?\.text === text/u);
    assert.match(api, /'Idempotency-Key': entryIdempotencyKey/u);
  });
});
