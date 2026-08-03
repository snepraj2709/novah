import {
  managePracticeRequestSchema,
  managePracticeResponseSchema,
} from './contracts.ts';
import { ApiError } from './errors.ts';
import { parseJson } from './http.ts';
import type { Authenticator } from './types.ts';
import type {
  PracticeRepository,
  SupportedPracticeAction,
} from './practice-types.ts';

export interface ManagePracticeDependencies {
  authenticator: Authenticator;
  repository: PracticeRepository;
}

export async function handleManagePractice(
  request: Request,
  dependencies: ManagePracticeDependencies,
): Promise<Response> {
  await dependencies.authenticator.authenticate(request);
  const parsed = managePracticeRequestSchema.safeParse(
    await parseJson(request),
  );
  if (!parsed.success) {
    throw new ApiError(400, 'bad_request', 'Practice request is invalid.');
  }
  if (parsed.data.action !== 'activate' && parsed.data.action !== 'reread') {
    throw new ApiError(
      409,
      'invalid_transition',
      'This Practice action is not available yet.',
    );
  }

  const practice = await dependencies.repository.managePractice(
    parsed.data.action satisfies SupportedPracticeAction,
    parsed.data.noteId,
  );
  return Response.json(managePracticeResponseSchema.parse({ practice }));
}
