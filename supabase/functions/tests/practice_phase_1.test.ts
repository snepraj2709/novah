import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  managePracticeRequestSchema,
  managePracticeResponseSchema,
  type PracticeEntry,
  type ManagePracticeRequest,
  type PracticeState,
} from '../_shared/contracts.ts';
import { ApiError } from '../_shared/errors.ts';
import { createHttpHandler } from '../_shared/http.ts';
import { handleManagePractice } from '../_shared/practice-handler.ts';
import type { PracticeRepository } from '../_shared/practice-types.ts';
import type { Authenticator } from '../_shared/types.ts';

const NOTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRACTICE: PracticeState = {
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
};
const ENTRY: PracticeEntry = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  kind: 'reflection',
  text: 'A normalized reflection.',
  sourceChannel: 'web',
  createdAt: '2026-08-03T12:00:00.000Z',
};

function request(body: unknown, origin?: string): Request {
  return new Request('http://localhost/functions/v1/manage-practice', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer synthetic',
      'Content-Type': 'application/json',
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

class Repository implements PracticeRepository {
  calls: Array<Exclude<ManagePracticeRequest, { action: 'addEntry' }>> = [];
  entries: Array<{ noteId: string; entryKind: string; text: string }> = [];
  async managePractice(
    request: Exclude<ManagePracticeRequest, { action: 'addEntry' }>,
  ) {
    this.calls.push(request);
    return PRACTICE;
  }
  async addEntry(
    noteId: string,
    entryKind: PracticeEntry['kind'],
    text: string,
  ) {
    this.entries.push({ noteId, entryKind, text });
    return { practice: PRACTICE, entry: { ...ENTRY, kind: entryKind, text } };
  }
}

const authenticator: Authenticator = {
  async authenticate() {
    return { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  },
};

describe('manage-practice contract', () => {
  it('strictly validates the final discriminated request union', () => {
    assert.equal(
      managePracticeRequestSchema.safeParse({
        action: 'activate',
        noteId: NOTE_ID,
      }).success,
      true,
    );
    assert.equal(
      managePracticeRequestSchema.safeParse({
        action: 'activate',
        noteId: NOTE_ID,
        extra: true,
      }).success,
      false,
    );
    assert.equal(
      managePracticeRequestSchema.safeParse({
        action: 'addEntry',
        noteId: NOTE_ID,
        entryKind: 'reflection',
        text: 'Valid reflection.',
        extra: true,
      }).success,
      false,
    );
    assert.equal(
      managePracticeRequestSchema.safeParse({
        action: 'addEntry',
        noteId: NOTE_ID,
        entryKind: 'unsupported',
        text: 'Invalid kind.',
      }).success,
      false,
    );
    assert.equal(
      managePracticeRequestSchema.safeParse({
        action: 'setInterval',
        noteId: NOTE_ID,
        intervalDays: 31,
      }).success,
      false,
    );
  });

  it('normalizes and returns a strict Reflection or Story entry', async () => {
    const repository = new Repository();
    const response = await handleManagePractice(
      request({
        action: 'addEntry',
        noteId: NOTE_ID,
        entryKind: 'story',
        text: '  A\n\tstory.  ',
      }),
      { authenticator, repository },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(repository.entries, [
      { noteId: NOTE_ID, entryKind: 'story', text: 'A story.' },
    ]);
    assert.deepEqual(await response.json(), {
      practice: PRACTICE,
      entry: { ...ENTRY, kind: 'story', text: 'A story.' },
    });
  });

  it('returns entry_too_long before repository access', async () => {
    const repository = new Repository();
    await assert.rejects(
      () =>
        handleManagePractice(
          request({
            action: 'addEntry',
            noteId: NOTE_ID,
            entryKind: 'reflection',
            text: 'x'.repeat(5_001),
          }),
          { authenticator, repository },
        ),
      (error: unknown) =>
        error instanceof ApiError && error.code === 'entry_too_long',
    );
    assert.equal(repository.entries.length, 0);
  });

  it('returns the strict current-state response for every lifecycle action', async () => {
    const repository = new Repository();
    const requests = [
      { action: 'activate', noteId: NOTE_ID },
      { action: 'reread', noteId: NOTE_ID },
      { action: 'setInterval', noteId: NOTE_ID, intervalDays: 12 },
      { action: 'pause', noteId: NOTE_ID },
      { action: 'pause', noteId: NOTE_ID, resumeOn: '2026-08-20' },
      { action: 'resume', noteId: NOTE_ID },
      { action: 'integrate', noteId: NOTE_ID },
      { action: 'confirmIntegrated', noteId: NOTE_ID },
      { action: 'stopCheckIns', noteId: NOTE_ID },
    ] satisfies Array<Exclude<ManagePracticeRequest, { action: 'addEntry' }>>;
    for (const lifecycleRequest of requests) {
      const response = await handleManagePractice(request(lifecycleRequest), {
        authenticator,
        repository,
      });
      assert.equal(response.status, 200);
      assert.equal(
        managePracticeResponseSchema.safeParse(await response.json()).success,
        true,
      );
    }
    assert.deepEqual(repository.calls, requests);
  });

  it('rejects malformed lifecycle requests without calling the repository', async () => {
    const repository = new Repository();
    await assert.rejects(
      () =>
        handleManagePractice(
          request({
            action: 'pause',
            noteId: NOTE_ID,
            resumeOn: '08/20/2026',
          }),
          { authenticator, repository },
        ),
      (error: unknown) =>
        error instanceof ApiError && error.code === 'bad_request',
    );
    assert.equal(repository.calls.length, 0);
  });

  it('keeps the existing authenticated CORS and error envelope behavior', async () => {
    const repository = new Repository();
    const handler = createHttpHandler(
      (incoming) =>
        handleManagePractice(incoming, { authenticator, repository }),
      { appUrl: 'https://novah.example' },
    );
    const denied = await handler(
      request({ action: 'activate', noteId: NOTE_ID }, 'https://evil.example'),
    );
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, 'origin_not_allowed');
    assert.equal(repository.calls.length, 0);
  });
});
