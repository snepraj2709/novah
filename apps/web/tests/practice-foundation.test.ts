import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { managePracticeResponseSchema } from '@novah/shared/contracts';

const NOTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('web Practice foundation', () => {
  it('accepts the strict active-state response used by Practice and Collection', () => {
    assert.equal(
      managePracticeResponseSchema.safeParse({
        practice: {
          noteId: NOTE_ID,
          status: 'active',
          intervalDays: 1,
          nextDueOn: '2026-08-04',
          pausedUntil: null,
          readyToResume: false,
          integratedAt: null,
          checkInsEnabled: false,
          nextCheckInOn: null,
          lastPractisedAt: null,
        },
      }).success,
      true,
    );
  });

  it('shows active slots, due reread, Collection activation, and all status filters', async () => {
    const [practice, collection, card] = await Promise.all([
      readFile(
        new URL('../src/pages/PracticePage.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../src/pages/LibraryPage.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../src/components/NoteCard.tsx', import.meta.url),
        'utf8',
      ),
    ]);
    assert.match(practice, /active slots/u);
    assert.match(practice, /onReread/u);
    assert.match(card, /Keep this with me/u);
    assert.match(collection, /practice_slots_full/u);
    assert.match(collection, /loadPracticeMap/u);
    assert.match(collection, /setSearchPractices/u);
    for (const label of ['Saved', 'Practising', 'Paused', 'Integrated']) {
      assert.match(collection, new RegExp(`>${label}<`, 'u'));
    }
  });

  it('keeps Reflection, Story, prompts, and entry content out of Practice cards', async () => {
    const card = await readFile(
      new URL('../src/components/NoteCard.tsx', import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(
      card,
      /Give me a prompt|Reflection|Add story|entry thread/u,
    );
  });
});
