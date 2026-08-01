import { ApiError, errorResponse } from './errors.ts';

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
    origins.add(configuration.appUrl.replace(/\/$/u, ''));
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

    if (origin && !origins.has(origin.replace(/\/$/u, ''))) {
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

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, 'bad_request', 'Request body must be valid JSON.');
  }
}
