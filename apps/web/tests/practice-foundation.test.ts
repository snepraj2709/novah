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

  it('keeps prompt inputs and entry content out of Practice cards', async () => {
    const card = await readFile(
      new URL('../src/components/NoteCard.tsx', import.meta.url),
      'utf8',
    );
    assert.match(card, /\bReflect\b/u);
    assert.match(card, /\bAdd story\b/u);
    assert.doesNotMatch(card, /Give me a prompt|textarea|Practice thread/u);
  });

  it('exposes the complete bandwidth-aware lifecycle in cards and the drawer', async () => {
    const [practice, card, drawer] = await Promise.all([
      readFile(
        new URL('../src/pages/PracticePage.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../src/components/NoteCard.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../src/components/NoteDetailDrawer.tsx', import.meta.url),
        'utf8',
      ),
    ]);

    assert.match(practice, /Ready to resume/u);
    assert.match(practice, /Integration check-ins/u);
    assert.match(practice, /showFullNote/u);
    assert.match(card, /practice-note-full/u);
    for (const label of [
      'Pause',
      'Integrated',
      'Change interval',
      'Resume',
      'Still integrated',
      'Stop check-ins',
    ]) {
      assert.match(`${card}\n${drawer}`, new RegExp(label, 'u'));
    }
    for (const action of [
      'setInterval',
      'pause',
      'resume',
      'integrate',
      'confirmIntegrated',
      'stopCheckIns',
    ]) {
      assert.match(drawer, new RegExp(`action: '${action}'`, 'u'));
    }
    assert.match(drawer, /Array\.from\(\s*\{\s*length:\s*30\s*\}/u);
    assert.match(drawer, /type="date"/u);
    assert.match(drawer, /practice_slots_full/u);
  });

  it('keeps settings Practice-only and removes fixed Review and digest runtime pages', async () => {
    const [settings, dashboard] = await Promise.all([
      readFile(
        new URL('../src/pages/SettingsPage.tsx', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../src/lib/dashboard.ts', import.meta.url), 'utf8'),
    ]);

    assert.match(settings, /Timezone/u);
    assert.match(settings, /Practice time/u);
    assert.match(settings, /Telegram/u);
    assert.doesNotMatch(settings, /digest|review/iu);
    assert.doesNotMatch(dashboard, /daily_digests|review_events/u);

    await assert.rejects(
      readFile(new URL('../src/pages/TodayPage.tsx', import.meta.url), 'utf8'),
      { code: 'ENOENT' },
    );
    await assert.rejects(
      readFile(new URL('../src/pages/ReviewPage.tsx', import.meta.url), 'utf8'),
      { code: 'ENOENT' },
    );
  });
});
