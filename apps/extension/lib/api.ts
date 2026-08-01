import {
  captureNoteResponseSchema,
  searchNotesRequestSchema,
  searchNotesResponseSchema,
  telegramLinkCodeRequestSchema,
  telegramLinkCodeResponseSchema,
  type CaptureNoteRequest,
  type CaptureNoteResponse,
  type SearchNotesRequest,
  type SearchNotesResponse,
  type TelegramLinkCodeResponse,
} from '@novah/shared/contracts';

import { getPublicExtensionConfig } from './config.ts';
import { supabase } from './supabase.ts';

export class ExtensionApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code: string, retryable: boolean) {
    super(message);
    this.name = 'ExtensionApiError';
    this.code = code;
    this.retryable = retryable;
  }
}

async function invokeFunction(
  functionName: 'capture-note' | 'search-notes' | 'telegram-link-code',
  body: unknown,
): Promise<unknown> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new ExtensionApiError(
      'Sign in before continuing.',
      'unauthorized',
      false,
    );
  }

  const configuration = getPublicExtensionConfig();
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
    throw new ExtensionApiError(
      'Novah could not reach the server. Your draft is safe.',
      'network_error',
      true,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorPayload = payload as {
      error?: { code?: unknown; message?: unknown; retryable?: unknown };
    } | null;
    const code =
      typeof errorPayload?.error?.code === 'string'
        ? errorPayload.error.code
        : 'request_failed';
    const retryable = errorPayload?.error?.retryable === true;
    const fallback =
      response.status === 401
        ? 'Your session expired. Sign in again.'
        : 'Novah could not complete the request.';
    const message =
      typeof errorPayload?.error?.message === 'string'
        ? errorPayload.error.message
        : fallback;
    throw new ExtensionApiError(message, code, retryable);
  }

  return payload;
}

export async function captureNote(
  request: CaptureNoteRequest,
): Promise<CaptureNoteResponse> {
  const payload = await invokeFunction('capture-note', request);
  const parsed = captureNoteResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ExtensionApiError(
      'Novah returned an invalid capture response. Your draft is safe.',
      'invalid_response',
      true,
    );
  }
  return parsed.data;
}

export async function searchNotes(
  request: SearchNotesRequest,
): Promise<SearchNotesResponse> {
  const validatedRequest = searchNotesRequestSchema.parse(request);
  const payload = await invokeFunction('search-notes', validatedRequest);
  const parsed = searchNotesResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ExtensionApiError(
      'Novah returned an invalid recall response.',
      'invalid_response',
      true,
    );
  }
  return parsed.data;
}

export async function generateTelegramLinkCode(): Promise<TelegramLinkCodeResponse> {
  const payload = await invokeFunction(
    'telegram-link-code',
    telegramLinkCodeRequestSchema.parse({}),
  );
  const parsed = telegramLinkCodeResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ExtensionApiError(
      'Novah returned an invalid Telegram link response.',
      'invalid_response',
      true,
    );
  }
  return parsed.data;
}
