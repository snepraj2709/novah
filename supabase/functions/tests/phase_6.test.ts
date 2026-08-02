import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  handleAccountDeletion,
  type AccountDeletionRepository,
} from '../_shared/account-deletion-handler.ts';
import { ApiError } from '../_shared/errors.ts';
import type { Authenticator } from '../_shared/types.ts';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

class SyntheticAuthenticator implements Authenticator {
  private readonly userId: string;

  constructor(userId = USER_A) {
    this.userId = userId;
  }

  async authenticate(): Promise<{ id: string }> {
    return { id: this.userId };
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
  it('deletes exactly the authenticated user and returns a strict response', async () => {
    const repository = new DeletionRepository();
    const response = await handleAccountDeletion(request({}), {
      authenticator: new SyntheticAuthenticator(),
      repository,
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
          },
        ),
      (cause: unknown) =>
        cause instanceof ApiError &&
        cause.status === 400 &&
        cause.code === 'bad_request',
    );
    assert.deepEqual(repository.deletedUserIds, []);
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
        }),
      (cause: unknown) => cause === repository.failure,
    );
  });
});
