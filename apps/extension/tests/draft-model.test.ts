import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addDraft,
  createCaptureDraft,
  draftFromSelection,
  draftToCaptureRequest,
  emptyDraftCollection,
  markDraftFailed,
  updateDraft,
  validateDraft,
} from '../lib/draft-model.ts';
import { parseDraftCollection } from '../lib/draft-storage.ts';

const REQUEST_ID = '00000000-0000-4000-8000-000000000001';

test('article selection preserves original text, title, and HTTP source', () => {
  const draft = draftFromSelection(
    {
      selectionText: '  Exact selected text stays unchanged.  ',
      pageTitle: 'A useful article',
      pageUrl: 'https://example.com/article?ref=novah',
    },
    REQUEST_ID,
  );

  assert.equal(draft.originalText, '  Exact selected text stays unchanged.  ');
  assert.equal(draft.sourceTitle, 'A useful article');
  assert.equal(draft.sourceUrl, 'https://example.com/article?ref=novah');
  assert.equal(draft.sourceUnavailable, false);
  assert.equal(draft.origin, 'selection');
});

test('Chrome PDF or internal URL falls back without persisting an unsafe URL', () => {
  const draft = draftFromSelection(
    {
      selectionText: 'A selected PDF passage',
      pageTitle: 'Research paper.pdf',
      pageUrl: 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html',
    },
    REQUEST_ID,
  );

  assert.equal(draft.sourceUrl, '');
  assert.equal(draft.sourceUnavailable, true);
  assert.equal(draft.sourceTitle, 'Research paper.pdf');
});

test('failed capture keeps the draft and reuses its idempotency key on retry', () => {
  const initial = createCaptureDraft({
    clientRequestId: REQUEST_ID,
    originalText: 'A durable capture draft',
  });
  const collection = addDraft(emptyDraftCollection(), initial);
  const failed = markDraftFailed(collection, REQUEST_ID, 'Network unavailable');
  const retried = updateDraft(failed, REQUEST_ID, {
    personalContext: 'Retry later',
  });
  const stored = retried.drafts[0];

  assert.equal(stored?.status, 'draft');
  assert.equal(stored?.clientRequestId, REQUEST_ID);
  assert.equal(draftToCaptureRequest(stored!).clientRequestId, REQUEST_ID);
});

test('adding more than ten unsaved captures never discards an older draft', () => {
  const drafts = Array.from({ length: 12 }, (_, index) =>
    createCaptureDraft({
      clientRequestId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      originalText: `Unsaved capture ${index}`,
    }),
  );
  const collection = drafts.reduce(addDraft, emptyDraftCollection());

  assert.equal(collection.drafts.length, drafts.length);
  assert.deepEqual(
    new Set(collection.drafts.map((draft) => draft.clientRequestId)),
    new Set(drafts.map((draft) => draft.clientRequestId)),
  );
});

test('capture validation rejects blank text and non-HTTP source URLs', () => {
  const invalid = createCaptureDraft({
    clientRequestId: REQUEST_ID,
    originalText: '   ',
    sourceUrl: 'file:///tmp/private.pdf',
  });
  const result = validateDraft(invalid);

  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.fieldErrors.originalText);
    assert.ok(result.fieldErrors.sourceUrl);
  }
});

test('capture request omits empty optional fields', () => {
  const request = draftToCaptureRequest(
    createCaptureDraft({
      clientRequestId: REQUEST_ID,
      originalText: 'Only required content',
      personalContext: '   ',
    }),
  );

  assert.deepEqual(request, {
    originalText: 'Only required content',
    captureChannel: 'extension',
    clientRequestId: REQUEST_ID,
  });
});

test('stored drafts with an unknown note type are discarded safely', () => {
  const invalidDraft = {
    ...createCaptureDraft({ clientRequestId: REQUEST_ID }),
    noteType: 'invented-type',
  };

  assert.deepEqual(
    parseDraftCollection({ activeId: REQUEST_ID, drafts: [invalidDraft] }),
    emptyDraftCollection(),
  );
});
