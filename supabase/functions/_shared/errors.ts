export type ApiErrorCode =
  | 'bad_request'
  | 'method_not_allowed'
  | 'origin_not_allowed'
  | 'unauthorized'
  | 'reauthentication_required'
  | 'ai_unavailable'
  | 'payload_too_large'
  | 'telegram_unavailable'
  | 'practice_slots_full'
  | 'practice_not_found'
  | 'invalid_transition'
  | 'entry_too_long'
  | 'reply_expired'
  | 'stale_action'
  | 'internal_error';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly retryable: boolean;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function errorResponse(error: unknown): Response {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(
          500,
          'internal_error',
          'The request could not be completed.',
          true,
        );

  return Response.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        retryable: apiError.retryable,
      },
    },
    { status: apiError.status },
  );
}
