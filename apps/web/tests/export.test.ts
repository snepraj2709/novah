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
    assert.equal(document.version, 2);
    assert.deepEqual(document.notes, [NOTE]);
    assert.equal(JSON.stringify(document).includes('summary'), false);
    assert.equal(JSON.stringify(document).includes('recallPrompt'), false);
    assert.equal(JSON.stringify(document).includes('tags'), false);
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
      /### Original note\n\n```\nA note with a concrete idea\.\n```/u,
    );
    assert.match(document, /- Source URL: https:\/\/example\.com\/source/u);
    assert.equal(document.includes('### Summary'), false);
    assert.equal(document.includes('### Recall prompt'), false);
  });

  it('preserves multiline content safely and handles absent context and source', () => {
    const unsafe: DashboardNote = {
      ...NOTE,
      originalText: '# Not an export heading\n```\n<script>alert(1)</script>',
      personalContext: null,
      sourceTitle: null,
      sourceUrl: null,
      captureChannel: null,
    };
    const document = markdownExport(
      [unsafe],
      new Date('2026-08-02T10:00:00.000Z'),
    );
    assert.match(document, /## 1\. Note/u);
    assert.match(
      document,
      /````\n# Not an export heading\n```\n<script>alert\(1\)<\/script>\n````/u,
    );
    assert.equal(document.includes('### Why it mattered'), false);
    assert.equal(document.includes('- Source'), false);
  });
});

describe('dashboard routing and local dates', () => {
  it('lands on Practice and leaves retired routes unsupported', () => {
    assert.equal(routeFromPath('/privacy'), '/privacy');
    assert.equal(routeFromPath('/settings'), '/settings');
    assert.equal(routeFromPath('/'), '/practice');
    assert.equal(routeFromPath('/practice'), '/practice');
    assert.equal(routeFromPath('/collection'), '/collection');
    assert.equal(routeFromPath('/today'), '/not-found');
    assert.equal(routeFromPath('/library'), '/not-found');
    assert.equal(routeFromPath('/review'), '/not-found');
    assert.equal(routeFromPath('/unknown'), '/not-found');
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
