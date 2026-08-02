export function passwordAuthenticationTime(
  accessToken: string,
): string | undefined {
  try {
    const encodedPayload = accessToken.split('.')[1];
    if (!encodedPayload) return undefined;
    const base64 = encodedPayload.replace(/-/gu, '+').replace(/_/gu, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(`${base64}${padding}`)) as {
      amr?: unknown;
    };
    if (!Array.isArray(payload.amr)) return undefined;
    const timestamps = payload.amr.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const method = (entry as { method?: unknown }).method;
      const timestamp = (entry as { timestamp?: unknown }).timestamp;
      return method === 'password' &&
        typeof timestamp === 'number' &&
        Number.isSafeInteger(timestamp) &&
        timestamp > 0
        ? [timestamp]
        : [];
    });
    if (timestamps.length === 0) return undefined;
    return new Date(Math.max(...timestamps) * 1_000).toISOString();
  } catch {
    return undefined;
  }
}
