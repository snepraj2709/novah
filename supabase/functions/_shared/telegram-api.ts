import { ApiError } from './errors.ts';
import {
  RATE_LIMIT_ONLY_RETRY_STATUSES,
  resilientFetch,
  type Wait,
} from './resilient-fetch.ts';
import type {
  TelegramGateway,
  TelegramMessageOptions,
} from './telegram-types.ts';

type Fetch = typeof fetch;

interface TelegramEnvelope {
  ok?: unknown;
  result?: unknown;
}

function telegramUnavailable(): ApiError {
  return new ApiError(
    503,
    'telegram_unavailable',
    'Telegram is temporarily unavailable.',
    true,
  );
}

export class TelegramApiClient implements TelegramGateway {
  private readonly botToken: string;
  private readonly request: Fetch;
  private readonly wait?: Wait;

  constructor(botToken: string, request: Fetch = fetch, wait?: Wait) {
    this.botToken = botToken;
    this.request = request;
    this.wait = wait;
  }

  private async call(
    method: string,
    body: Record<string, unknown>,
    retryMode: 'safe' | 'rate-limit-only' = 'safe',
  ) {
    let response: Response;
    try {
      response = await resilientFetch(
        this.request,
        `https://api.telegram.org/bot${this.botToken}/${method}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        {
          timeoutMs: 20_000,
          maximumAttempts: 2,
          retryNetworkErrors: retryMode === 'safe',
          ...(retryMode === 'rate-limit-only'
            ? { retryStatuses: RATE_LIMIT_ONLY_RETRY_STATUSES }
            : {}),
          wait: this.wait,
        },
      );
    } catch {
      throw telegramUnavailable();
    }
    if (!response.ok) throw telegramUnavailable();
    try {
      const payload = (await response.json()) as TelegramEnvelope;
      if (payload.ok !== true) throw new Error('Telegram request failed');
      return payload.result;
    } catch {
      throw telegramUnavailable();
    }
  }

  async sendMessage(
    chatId: number,
    text: string,
    options?: TelegramMessageOptions,
  ): Promise<void> {
    await this.call(
      'sendMessage',
      {
        chat_id: chatId,
        text,
        link_preview_options: { is_disabled: true },
        ...(options?.inlineKeyboard
          ? {
              reply_markup: {
                inline_keyboard: options.inlineKeyboard.map((row) =>
                  row.map((button) => ({
                    text: button.text,
                    callback_data: button.callbackData,
                  })),
                ),
              },
            }
          : {}),
      },
      'rate-limit-only',
    );
  }

  async sendForceReply(chatId: number, text: string): Promise<number> {
    const result = (await this.call(
      'sendMessage',
      {
        chat_id: chatId,
        text,
        link_preview_options: { is_disabled: true },
        reply_markup: { force_reply: true, selective: true },
      },
      'rate-limit-only',
    )) as { message_id?: unknown };
    if (
      !result ||
      typeof result.message_id !== 'number' ||
      !Number.isSafeInteger(result.message_id)
    ) {
      throw telegramUnavailable();
    }
    return result.message_id;
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
  ): Promise<void> {
    await this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  }

  async downloadVoice(
    fileId: string,
    maximumBytes: number,
  ): Promise<Uint8Array> {
    const result = (await this.call('getFile', { file_id: fileId })) as {
      file_path?: unknown;
      file_size?: unknown;
    };
    const filePath = result?.file_path;
    const reportedSize = result?.file_size;
    if (
      typeof filePath !== 'string' ||
      !/^(?!\/)(?!.*\.\.)[A-Za-z0-9_./-]+$/u.test(filePath) ||
      (typeof reportedSize === 'number' && reportedSize > maximumBytes)
    ) {
      throw new ApiError(
        413,
        'payload_too_large',
        'Voice notes must be two minutes or less.',
      );
    }

    let response: Response;
    try {
      response = await resilientFetch(
        this.request,
        `https://api.telegram.org/file/bot${this.botToken}/${filePath}`,
        {},
        { timeoutMs: 20_000, maximumAttempts: 2, wait: this.wait },
      );
    } catch {
      throw telegramUnavailable();
    }
    if (!response.ok) throw telegramUnavailable();
    const contentLength = Number(response.headers.get('Content-Length'));
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
      throw new ApiError(
        413,
        'payload_too_large',
        'Voice notes must be two minutes or less.',
      );
    }
    if (!response.body) throw telegramUnavailable();
    const reader = response.body.getReader();
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
            'Voice notes must be two minutes or less.',
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
}
