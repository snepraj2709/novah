import { MAX_TELEGRAM_MESSAGE_LENGTH } from '../../../packages/shared/src/constants/index.ts';
import type { TelegramMessageOptions } from './telegram-types.ts';

interface TelegramMessageSender {
  sendMessage(
    chatId: number,
    text: string,
    options?: TelegramMessageOptions,
  ): Promise<void>;
}

export function splitTelegramMessage(text: string): string[] {
  if (text.length <= MAX_TELEGRAM_MESSAGE_LENGTH) return [text];

  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + MAX_TELEGRAM_MESSAGE_LENGTH, text.length);
    const finalCodeUnit = text.charCodeAt(end - 1);
    if (
      end < text.length &&
      finalCodeUnit >= 0xd800 &&
      finalCodeUnit <= 0xdbff
    ) {
      end -= 1;
    }
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}

export async function sendTelegramMessageParts(
  telegram: TelegramMessageSender,
  chatId: number,
  text: string,
  options?: TelegramMessageOptions,
): Promise<number> {
  const parts = splitTelegramMessage(text);
  for (const [index, part] of parts.entries()) {
    await telegram.sendMessage(
      chatId,
      part,
      index === parts.length - 1 ? options : undefined,
    );
  }
  return parts.length;
}
