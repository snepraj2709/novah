import {
  managePracticeRequestSchema,
  managePracticeResponseSchema,
} from './contracts.ts';
import { MAX_PRACTICE_ENTRY_TEXT_LENGTH } from '../../../packages/shared/src/constants/index.ts';
import { ApiError } from './errors.ts';
import { parseJson } from './http.ts';
import { normalizeCapturedText } from './normalization.ts';
import type { Authenticator } from './types.ts';
import type { PracticeRepository } from './practice-types.ts';

export interface ManagePracticeDependencies {
  authenticator: Authenticator;
  repository: PracticeRepository;
}

export async function handleManagePractice(
  request: Request,
  dependencies: ManagePracticeDependencies,
): Promise<Response> {
  await dependencies.authenticator.authenticate(request);
  const body = await parseJson(request);
  if (
    typeof body === 'object' &&
    body !== null &&
    'action' in body &&
    body.action === 'addEntry' &&
    'text' in body &&
    typeof body.text === 'string' &&
    normalizeCapturedText(body.text).length > MAX_PRACTICE_ENTRY_TEXT_LENGTH
  ) {
    throw new ApiError(
      413,
      'entry_too_long',
      'That Practice entry is too long.',
    );
  }
  const parsed = managePracticeRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'bad_request', 'Practice request is invalid.');
  }
  if (parsed.data.action === 'addEntry') {
    const result = await dependencies.repository.addEntry(
      parsed.data.noteId,
      parsed.data.entryKind,
      normalizeCapturedText(parsed.data.text),
    );
    return Response.json(managePracticeResponseSchema.parse(result));
  }
  const practice = await dependencies.repository.managePractice(parsed.data);
  return Response.json(managePracticeResponseSchema.parse({ practice }));
}
