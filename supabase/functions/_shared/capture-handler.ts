import {
  captureNoteRequestSchema,
  captureNoteResponseSchema,
  OPENAI_EMBEDDING_DIMENSIONS,
} from './contracts.ts';
import { ApiError } from './errors.ts';
import { parseJson } from './http.ts';
import {
  normalizeCapturedText,
  optionalNormalizedText,
} from './normalization.ts';
import type {
  AiProvider,
  Authenticator,
  NoteRepository,
  StoredCapture,
} from './types.ts';

export interface CaptureDependencies {
  authenticator: Authenticator;
  repository: NoteRepository;
  ai: AiProvider;
}

function captureResponse(capture: StoredCapture): Response {
  return Response.json(
    captureNoteResponseSchema.parse({
      note: {
        id: capture.id,
        originalText: capture.originalText,
        noteType: capture.noteType,
        summary: capture.summary,
        tags: capture.tags,
        firstReviewDate: capture.firstReviewDate,
      },
    }),
  );
}

export async function handleCaptureNote(
  request: Request,
  dependencies: CaptureDependencies,
): Promise<Response> {
  await dependencies.authenticator.authenticate(request);

  const parsed = captureNoteRequestSchema.safeParse(await parseJson(request));
  if (!parsed.success) {
    throw new ApiError(400, 'bad_request', 'Capture request is invalid.');
  }

  const existing = await dependencies.repository.findByClientRequestId(
    parsed.data.clientRequestId,
  );
  if (existing) return captureResponse(existing);

  const originalText = normalizeCapturedText(parsed.data.originalText);
  const personalContext = optionalNormalizedText(parsed.data.personalContext);
  const sourceTitle = optionalNormalizedText(parsed.data.sourceTitle);

  let enrichment;
  let embedding: number[];
  try {
    enrichment = await dependencies.ai.enrich({
      originalText,
      personalContext,
      requestedNoteType: parsed.data.noteType,
    });
    if (parsed.data.noteType) enrichment.noteType = parsed.data.noteType;

    embedding = await dependencies.ai.embed(
      JSON.stringify({
        originalText,
        personalContext: personalContext ?? null,
        summary: enrichment.summary,
        tags: enrichment.tags,
        recallPrompt: enrichment.recallPrompt,
      }),
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      503,
      'ai_unavailable',
      'Note enrichment is temporarily unavailable. Retry this draft.',
      true,
    );
  }

  if (
    embedding.length !== OPENAI_EMBEDDING_DIMENSIONS ||
    embedding.some((value) => !Number.isFinite(value))
  ) {
    throw new ApiError(
      503,
      'ai_unavailable',
      'Note enrichment is temporarily unavailable. Retry this draft.',
      true,
    );
  }

  const capture = await dependencies.repository.captureAtomic({
    ...parsed.data,
    originalText,
    personalContext,
    sourceTitle,
    ...enrichment,
    embedding,
  });

  return captureResponse(capture);
}
