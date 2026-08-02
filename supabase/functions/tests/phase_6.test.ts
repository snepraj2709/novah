import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  handleAccountDeletion,
  type AccountDeletionRepository,
} from '../_shared/account-deletion-handler.ts';
import { passwordAuthenticationTime } from '../_shared/auth-claims.ts';
import { ApiError } from '../_shared/errors.ts';
import type { Authenticator } from '../_shared/types.ts';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = new Date('2026-08-02T12:00:00.000Z');

class SyntheticAuthenticator implements Authenticator {
  private readonly userId: string;
  private readonly passwordAuthenticatedAt: string | null;

  constructor(
    userId = USER_A,
    passwordAuthenticatedAt: string | null = NOW.toISOString(),
  ) {
    this.userId = userId;
    this.passwordAuthenticatedAt = passwordAuthenticatedAt;
  }

  async authenticate(): Promise<{
    id: string;
    passwordAuthenticatedAt?: string;
  }> {
    return {
      id: this.userId,
      ...(this.passwordAuthenticatedAt === null
        ? {}
        : { passwordAuthenticatedAt: this.passwordAuthenticatedAt }),
    };
  }
}

class DeletionRepository implements AccountDeletionRepository {
  deletedUserIds: string[] = [];
  failure: Error | null = null;

  async deleteUser(userId: string): Promise<void> {
    if (this.failure) throw this.failure;
    this.deletedUserIds.push(userId);
  }
}

function request(body: unknown): Request {
  return new Request('http://localhost/functions/v1/delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('account deletion boundary', () => {
  it('extracts the persistent password timestamp from validated JWT claims', () => {
    const payload = Buffer.from(
      JSON.stringify({
        amr: [
          { method: 'otp', timestamp: 1_785_670_000 },
          { method: 'password', timestamp: 1_785_670_699 },
        ],
      }),
    ).toString('base64url');
    assert.equal(
      passwordAuthenticationTime(`header.${payload}.signature`),
      new Date(1_785_670_699_000).toISOString(),
    );
    assert.equal(
      passwordAuthenticationTime('header.invalid.signature'),
      undefined,
    );
  });

  it('deletes exactly the authenticated user and returns a strict response', async () => {
    const repository = new DeletionRepository();
    const response = await handleAccountDeletion(request({}), {
      authenticator: new SyntheticAuthenticator(),
      repository,
      now: () => NOW,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true });
    assert.deepEqual(repository.deletedUserIds, [USER_A]);
  });

  it('rejects client-supplied user IDs before any deletion', async () => {
    const repository = new DeletionRepository();
    await assert.rejects(
      () =>
        handleAccountDeletion(
          request({ userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
          {
            authenticator: new SyntheticAuthenticator(),
            repository,
            now: () => NOW,
          },
        ),
      (cause: unknown) =>
        cause instanceof ApiError &&
        cause.status === 400 &&
        cause.code === 'bad_request',
    );
    assert.deepEqual(repository.deletedUserIds, []);
  });

  it('requires a recent server-verified sign-in before deletion', async () => {
    for (const passwordAuthenticatedAt of [
      null,
      '2026-08-02T11:54:59.000Z',
      'not-a-date',
      '2026-08-02T12:00:31.000Z',
    ]) {
      const repository = new DeletionRepository();
      await assert.rejects(
        () =>
          handleAccountDeletion(request({}), {
            authenticator: new SyntheticAuthenticator(
              USER_A,
              passwordAuthenticatedAt,
            ),
            repository,
            now: () => NOW,
          }),
        (cause: unknown) =>
          cause instanceof ApiError &&
          cause.status === 403 &&
          cause.code === 'reauthentication_required',
      );
      assert.deepEqual(repository.deletedUserIds, []);
    }
  });

  it('does not report success when privileged deletion fails', async () => {
    const repository = new DeletionRepository();
    repository.failure = new ApiError(
      500,
      'internal_error',
      'Account deletion could not be completed.',
      true,
    );
    await assert.rejects(
      () =>
        handleAccountDeletion(request({}), {
          authenticator: new SyntheticAuthenticator(),
          repository,
          now: () => NOW,
        }),
      (cause: unknown) => cause === repository.failure,
    );
  });
});
