import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  managePracticeRequestSchema,
  managePracticeResponseSchema,
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
  calls: Array<{ action: string; noteId: string }> = [];
  async managePractice(action: 'activate' | 'reread', noteId: string) {
    this.calls.push({ action, noteId });
    return PRACTICE;
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
        action: 'setInterval',
        noteId: NOTE_ID,
        intervalDays: 31,
      }).success,
      false,
    );
  });

  it('returns the strict current-state response for activation and reread', async () => {
    const repository = new Repository();
    for (const action of ['activate', 'reread'] as const) {
      const response = await handleManagePractice(
        request({ action, noteId: NOTE_ID }),
        { authenticator, repository },
      );
      assert.equal(response.status, 200);
      assert.equal(
        managePracticeResponseSchema.safeParse(await response.json()).success,
        true,
      );
    }
    assert.deepEqual(repository.calls, [
      { action: 'activate', noteId: NOTE_ID },
      { action: 'reread', noteId: NOTE_ID },
    ]);
  });

  it('rejects later-phase actions without calling the repository', async () => {
    const repository = new Repository();
    await assert.rejects(
      () =>
        handleManagePractice(request({ action: 'pause', noteId: NOTE_ID }), {
          authenticator,
          repository,
        }),
      (error: unknown) =>
        error instanceof ApiError && error.code === 'invalid_transition',
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
