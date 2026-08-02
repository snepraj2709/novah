import { ApiError, errorResponse } from './errors.ts';
import { MAX_JSON_REQUEST_BYTES } from '../../../packages/shared/src/constants/index.ts';

export interface CorsConfiguration {
  appUrl?: string;
  extensionIds?: string[];
  allowLocalDevelopment?: boolean;
}

const LOCAL_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);

function allowedOrigins(configuration: CorsConfiguration): Set<string> {
  const origins = new Set<string>();

  if (configuration.appUrl) {
    try {
      const url = new URL(configuration.appUrl);
      if (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      ) {
        origins.add(url.origin);
      }
    } catch {
      // Invalid configuration is fail-closed: it contributes no allowed origin.
    }
  }

  for (const extensionId of configuration.extensionIds ?? []) {
    if (/^[a-p]{32}$/u.test(extensionId)) {
      origins.add(`chrome-extension://${extensionId}`);
    }
  }

  if (configuration.allowLocalDevelopment) {
    for (const origin of LOCAL_ORIGINS) origins.add(origin);
  }

  return origins;
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function withHeaders(response: Response, headers: HeadersInit): Response {
  const nextHeaders = new Headers(response.headers);
  for (const [key, value] of new Headers(headers)) nextHeaders.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders,
  });
}

export function createHttpHandler(
  handler: (request: Request) => Promise<Response>,
  configuration: CorsConfiguration,
): (request: Request) => Promise<Response> {
  const origins = allowedOrigins(configuration);

  return async (request) => {
    const origin = request.headers.get('Origin');
    const headers = corsHeaders(origin);

    if (origin && !origins.has(origin)) {
      return withHeaders(
        errorResponse(
          new ApiError(403, 'origin_not_allowed', 'Origin is not allowed.'),
        ),
        corsHeaders(null),
      );
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return withHeaders(
        errorResponse(
          new ApiError(
            405,
            'method_not_allowed',
            'Only POST requests are supported.',
          ),
        ),
        headers,
      );
    }

    try {
      return withHeaders(await handler(request), headers);
    } catch (error) {
      return withHeaders(errorResponse(error), headers);
    }
  };
}

function declaredLength(request: Request): number | null {
  const value = request.headers.get('Content-Length');
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function readBody(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array | null> {
  const length = declaredLength(request);
  if (length !== null && length > maximumBytes) {
    throw new ApiError(413, 'payload_too_large', 'Request body is too large.');
  }
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ApiError(
          413,
          'payload_too_large',
          'Request body is too large.',
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}

function decodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, 'bad_request', 'Request body must be valid JSON.');
  }
}

export async function parseJson(
  request: Request,
  maximumBytes = MAX_JSON_REQUEST_BYTES,
): Promise<unknown> {
  const bytes = await readBody(request, maximumBytes);
  if (!bytes || bytes.byteLength === 0) {
    throw new ApiError(400, 'bad_request', 'Request body must be valid JSON.');
  }
  return decodeJson(bytes);
}

export async function parseOptionalJson(
  request: Request,
  maximumBytes = MAX_JSON_REQUEST_BYTES,
): Promise<unknown | null> {
  const bytes = await readBody(request, maximumBytes);
  return !bytes || bytes.byteLength === 0 ? null : decodeJson(bytes);
}
