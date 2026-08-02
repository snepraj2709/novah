import { ApiError } from './errors.ts';
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

  constructor(botToken: string, request: Fetch = fetch) {
    this.botToken = botToken;
    this.request = request;
  }

  private async call(method: string, body: Record<string, unknown>) {
    let response: Response;
    try {
      response = await this.request(
        `https://api.telegram.org/bot${this.botToken}/${method}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
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
    await this.call('sendMessage', {
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
    });
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
      response = await this.request(
        `https://api.telegram.org/file/bot${this.botToken}/${filePath}`,
        { signal: AbortSignal.timeout(20_000) },
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
