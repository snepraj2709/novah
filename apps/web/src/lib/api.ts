import {
  deleteAccountRequestSchema,
  deleteAccountResponseSchema,
  searchNotesRequestSchema,
  searchNotesResponseSchema,
  telegramLinkCodeRequestSchema,
  telegramLinkCodeResponseSchema,
  type SearchNotesRequest,
  type SearchNotesResponse,
  type TelegramLinkCodeResponse,
} from '@novah/shared/contracts';

import { getPublicWebConfig } from './config.ts';
import { supabase } from './supabase.ts';

export class WebApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code: string, retryable: boolean) {
    super(message);
    this.name = 'WebApiError';
    this.code = code;
    this.retryable = retryable;
  }
}

async function invokeFunction(
  functionName: 'search-notes' | 'telegram-link-code' | 'delete-account',
  body: unknown,
): Promise<unknown> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new WebApiError('Sign in before continuing.', 'unauthorized', false);
  }

  const configuration = getPublicWebConfig();
  let response: Response;
  try {
    response = await fetch(
      `${configuration.supabaseUrl}/functions/v1/${functionName}`,
      {
        method: 'POST',
        headers: {
          apikey: configuration.supabasePublishableKey,
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
  } catch {
    throw new WebApiError(
      'Novah could not reach the server.',
      'network_error',
      true,
    );
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorPayload = payload as {
      error?: { code?: unknown; message?: unknown; retryable?: unknown };
    } | null;
    throw new WebApiError(
      typeof errorPayload?.error?.message === 'string'
        ? errorPayload.error.message
        : response.status === 401
          ? 'Your session expired. Sign in again.'
          : 'Novah could not complete the request.',
      typeof errorPayload?.error?.code === 'string'
        ? errorPayload.error.code
        : 'request_failed',
      errorPayload?.error?.retryable === true,
    );
  }
  return payload;
}

export async function searchNotes(
  request: SearchNotesRequest,
): Promise<SearchNotesResponse> {
  const payload = await invokeFunction(
    'search-notes',
    searchNotesRequestSchema.parse(request),
  );
  return searchNotesResponseSchema.parse(payload);
}

export async function generateTelegramLinkCode(): Promise<TelegramLinkCodeResponse> {
  const payload = await invokeFunction(
    'telegram-link-code',
    telegramLinkCodeRequestSchema.parse({}),
  );
  return telegramLinkCodeResponseSchema.parse(payload);
}

export async function deleteAccount(): Promise<void> {
  const payload = await invokeFunction(
    'delete-account',
    deleteAccountRequestSchema.parse({}),
  );
  deleteAccountResponseSchema.parse(payload);
}
