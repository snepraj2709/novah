type Fetch = typeof fetch;

export type Wait = (milliseconds: number) => Promise<void>;

export interface ResilientFetchOptions {
  timeoutMs: number;
  maximumAttempts?: number;
  retryNetworkErrors?: boolean;
  retryStatuses?: ReadonlySet<number>;
  wait?: Wait;
}

const SAFE_RETRY_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(5_000, Math.ceil(seconds * 1_000));
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.min(5_000, Math.max(0, date - Date.now()));
    }
  }
  return Math.min(5_000, 250 * 2 ** (attempt - 1));
}

export async function resilientFetch(
  request: Fetch,
  input: string | URL | Request,
  init: RequestInit,
  options: ResilientFetchOptions,
): Promise<Response> {
  const maximumAttempts = Math.max(1, options.maximumAttempts ?? 2);
  const retryStatuses = options.retryStatuses ?? SAFE_RETRY_STATUSES;
  const wait = options.wait ?? defaultWait;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await request(input, {
        ...init,
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      if (attempt >= maximumAttempts || options.retryNetworkErrors === false) {
        throw error;
      }
      await wait(retryDelay(null, attempt));
      continue;
    }

    if (attempt < maximumAttempts && retryStatuses.has(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      await wait(retryDelay(response, attempt));
      continue;
    }
    return response;
  }

  throw new Error('Provider request exhausted without a response.');
}

export const RATE_LIMIT_ONLY_RETRY_STATUSES: ReadonlySet<number> = new Set([
  429,
]);
