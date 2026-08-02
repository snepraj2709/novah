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
}

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

  await dependencies.repository.deleteUser(user.id);
  return Response.json(deleteAccountResponseSchema.parse({ deleted: true }));
}
