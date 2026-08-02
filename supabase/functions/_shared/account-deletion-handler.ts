import {
  deleteAccountRequestSchema,
  deleteAccountResponseSchema,
} from '../../../packages/shared/src/contracts/index.ts';
import { ApiError } from './errors.ts';
import { parseJson } from './http.ts';
import type { Authenticator } from './types.ts';

export interface AccountDeletionRepository {
  deleteUser(userId: string): Promise<void>;
}

export interface AccountDeletionDependencies {
  authenticator: Authenticator;
  repository: AccountDeletionRepository;
  now?: () => Date;
}

const MAX_REAUTHENTICATION_AGE_MS = 5 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 30 * 1_000;

export async function handleAccountDeletion(
  request: Request,
  dependencies: AccountDeletionDependencies,
): Promise<Response> {
  const user = await dependencies.authenticator.authenticate(request);
  const body = deleteAccountRequestSchema.safeParse(await parseJson(request));
  if (!body.success) {
    throw new ApiError(
      400,
      'bad_request',
      'Account deletion request is invalid.',
    );
  }

  const now = (dependencies.now ?? (() => new Date()))().getTime();
  const passwordAuthenticatedAt = Date.parse(
    user.passwordAuthenticatedAt ?? '',
  );
  if (
    !Number.isFinite(passwordAuthenticatedAt) ||
    passwordAuthenticatedAt > now + MAX_CLOCK_SKEW_MS ||
    now - passwordAuthenticatedAt > MAX_REAUTHENTICATION_AGE_MS
  ) {
    throw new ApiError(
      403,
      'reauthentication_required',
      'Sign in again before deleting your account.',
    );
  }

  await dependencies.repository.deleteUser(user.id);
  return Response.json(deleteAccountResponseSchema.parse({ deleted: true }));
}
