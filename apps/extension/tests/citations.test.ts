import assert from 'node:assert/strict';
import test from 'node:test';

import { answerSegments } from '../lib/citations.ts';

test('maps synthesis citations only to returned note ids', () => {
  const segments = answerSegments('First idea [1], then another [2].', [
    { number: 1, noteId: 'note-a' },
    { number: 2, noteId: 'note-b' },
  ]);

  assert.deepEqual(
    segments.filter((segment) => segment.type === 'citation'),
    [
      { type: 'citation', value: '[1]', number: 1, noteId: 'note-a' },
      { type: 'citation', value: '[2]', number: 2, noteId: 'note-b' },
    ],
  );
});

test('leaves unknown citation markers as plain text', () => {
  const segments = answerSegments('Grounded [1], unknown [9].', [
    { number: 1, noteId: 'note-a' },
  ]);

  assert.equal(
    segments.map((segment) => segment.value).join(''),
    'Grounded [1], unknown [9].',
  );
  assert.equal(
    segments.filter((segment) => segment.type === 'citation').length,
    1,
  );
});
