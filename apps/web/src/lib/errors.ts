export function errorMessage(
  cause: unknown,
  fallback = 'Novah could not complete that request.',
): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  if (
    cause &&
    typeof cause === 'object' &&
    'message' in cause &&
    typeof cause.message === 'string' &&
    cause.message.trim()
  ) {
    return cause.message;
  }
  return fallback;
}
