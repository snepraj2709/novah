import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DashboardNote } from '../src/lib/dashboard.ts';
import { jsonExport, markdownExport } from '../src/lib/export.ts';
import { routeFromPath } from '../src/lib/routes.ts';
import { candidateUtcRange, localDateFor } from '../src/lib/time.ts';

const NOTE: DashboardNote = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  originalText: 'A note with a concrete idea.',
  personalContext: 'It changed how I approach testing.',
  noteType: 'lesson',
  summary: 'Test behavior through public boundaries.',
  tags: ['testing', 'boundaries'],
  recallPrompt: 'Which boundary should the test use?',
  sourceTitle: 'Synthetic source',
  sourceUrl: 'https://example.com/source',
  captureChannel: 'web',
  capturedAt: '2026-08-02T09:30:00.000Z',
};

describe('dashboard exports', () => {
  it('produces a valid, versioned JSON document', () => {
    const document = JSON.parse(
      jsonExport([NOTE], new Date('2026-08-02T10:00:00.000Z')),
    ) as Record<string, unknown>;
    assert.equal(document.format, 'novah-export');
    assert.equal(document.version, 1);
    assert.deepEqual(document.notes, [NOTE]);
  });

  it('produces readable Markdown with note content and provenance', () => {
    const document = markdownExport(
      [NOTE],
      new Date('2026-08-02T10:00:00.000Z'),
    );
    assert.match(document, /^# Novah export/mu);
    assert.match(document, /## 1\. Synthetic source/u);
    assert.match(
      document,
      /### Original note\n\nA note with a concrete idea\./u,
    );
    assert.match(document, /- Source: https:\/\/example\.com\/source/u);
    assert.match(document, /### Recall prompt/u);
  });
});

describe('dashboard routing and local dates', () => {
  it('keeps known routes and safely falls back to Today', () => {
    assert.equal(routeFromPath('/privacy'), '/privacy');
    assert.equal(routeFromPath('/settings'), '/settings');
    assert.equal(routeFromPath('/unknown'), '/today');
  });

  it('uses the profile timezone and a range covering all UTC offsets', () => {
    const now = new Date('2026-08-01T20:00:00.000Z');
    assert.equal(localDateFor(now, 'Asia/Kolkata'), '2026-08-02');
    assert.equal(localDateFor(now, 'America/Los_Angeles'), '2026-08-01');
    assert.deepEqual(candidateUtcRange('2026-08-02'), {
      start: '2026-08-01T10:00:00.000Z',
      end: '2026-08-03T14:00:00.000Z',
    });
  });
});
