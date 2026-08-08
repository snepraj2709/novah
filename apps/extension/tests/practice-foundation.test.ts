import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  captureNoteResponseSchema,
  managePracticeRequestSchema,
} from '@novah/shared/contracts';

const NOTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('extension Practice foundation', () => {
  it('validates the breaking capture response without firstReviewDate', () => {
    assert.equal(
      captureNoteResponseSchema.safeParse({
        note: {
          id: NOTE_ID,
          originalText: 'Exact original.',
          noteType: 'lesson',
        },
      }).success,
      true,
    );
    assert.equal(
      captureNoteResponseSchema.safeParse({
        note: {
          id: NOTE_ID,
          originalText: 'Exact original.',
          noteType: 'lesson',
          firstReviewDate: '2026-08-04',
        },
      }).success,
      false,
    );
  });

  it('uses the strict activation contract', () => {
    assert.deepEqual(
      managePracticeRequestSchema.parse({
        action: 'activate',
        noteId: NOTE_ID,
      }),
      { action: 'activate', noteId: NOTE_ID },
    );
  });

  it('ships only Capture and Find tabs with collapsed optional details', async () => {
    const source = await readFile(
      new URL('../entrypoints/sidepanel/App.tsx', import.meta.url),
      'utf8',
    );
    assert.match(source, /type Tab = 'capture' \| 'find'/u);
    assert.match(source, /<summary>Add details<\/summary>/u);
    assert.match(source, /Keep this with me/u);
    assert.match(source, /\bDone\b/u);
    assert.match(source, /practice_slots_full/u);
    assert.match(source, /Saved, but all three Practice slots are full/u);
    assert.doesNotMatch(source, /setTab\('settings'\)|setTab\('recall'\)/u);
  });

  it('dismisses the saved screen shortly after capture', async () => {
    const source = await readFile(
      new URL('../entrypoints/sidepanel/App.tsx', import.meta.url),
      'utf8',
    );

    assert.match(source, /const SAVED_SUCCESS_DURATION_MS = 5_000;/u);
    assert.match(source, /window\.setTimeout\([\s\S]*setSaved\(null\)/u);
    assert.match(source, /window\.clearTimeout\(timeoutId\)/u);
  });

  it('keeps the saved-screen action buttons aligned', async () => {
    const styles = await readFile(
      new URL('../entrypoints/sidepanel/style.css', import.meta.url),
      'utf8',
    );

    assert.match(
      styles,
      /\.empty-card \.button-row \{\n  align-items: stretch;\n  justify-content: center;\n\}/u,
    );
    assert.match(styles, /\.empty-card > \.primary \{/u);
  });
});
