import {
  MIN_SYNTHESIS_SIMILARITY,
  OPENAI_EMBEDDING_DIMENSIONS,
  searchNotesRequestSchema,
  searchNotesResponseSchema,
} from './contracts.ts';
import { renderGroundedSynthesis } from './citations.ts';
import { ApiError } from './errors.ts';
import { parseJson } from './http.ts';
import { normalizeCapturedText } from './normalization.ts';
import type { AiProvider, Authenticator, NoteRepository } from './types.ts';

export interface SearchDependencies {
  authenticator: Authenticator;
  repository: NoteRepository;
  ai: AiProvider;
  minimumSimilarity?: number;
}

export async function handleSearchNotes(
  request: Request,
  dependencies: SearchDependencies,
): Promise<Response> {
  await dependencies.authenticator.authenticate(request);

  const parsed = searchNotesRequestSchema.safeParse(await parseJson(request));
  if (!parsed.success) {
    throw new ApiError(400, 'bad_request', 'Search request is invalid.');
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await dependencies.ai.embed(
      normalizeCapturedText(parsed.data.query),
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      503,
      'ai_unavailable',
      'Search is temporarily unavailable.',
      true,
    );
  }

  if (
    queryEmbedding.length !== OPENAI_EMBEDDING_DIMENSIONS ||
    queryEmbedding.some((value) => !Number.isFinite(value))
  ) {
    throw new ApiError(
      503,
      'ai_unavailable',
      'Search is temporarily unavailable.',
      true,
    );
  }

  const matches = await dependencies.repository.matchNotes(
    queryEmbedding,
    parsed.data.limit,
  );
  const threshold = dependencies.minimumSimilarity ?? MIN_SYNTHESIS_SIMILARITY;

  if (matches.length === 0 || matches[0].similarity < threshold) {
    return Response.json(
      searchNotesResponseSchema.parse({
        answer: null,
        citations: [],
        matches,
        synthesisWithheld: true,
      }),
    );
  }

  let claims;
  try {
    claims = await dependencies.ai.synthesize({
      query: normalizeCapturedText(parsed.data.query),
      matches,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      503,
      'ai_unavailable',
      'Search is temporarily unavailable.',
      true,
    );
  }

  const synthesis = renderGroundedSynthesis(claims, matches);
  if (!synthesis) {
    return Response.json(
      searchNotesResponseSchema.parse({
        answer: null,
        citations: [],
        matches,
        synthesisWithheld: true,
      }),
    );
  }

  return Response.json(
    searchNotesResponseSchema.parse({
      ...synthesis,
      matches,
      synthesisWithheld: false,
    }),
  );
}
