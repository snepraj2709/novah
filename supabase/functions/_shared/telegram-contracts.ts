import { z } from 'zod';

import type { TelegramUpdate } from './telegram-types.ts';

const safeInteger = z
  .number()
  .int()
  .refine(Number.isSafeInteger, 'Must be a safe integer');

const rawVoiceSchema = z
  .object({
    file_id: z.string().min(1),
    duration: z.number().int().nonnegative(),
    file_size: safeInteger.nonnegative().optional(),
    mime_type: z.string().min(1).optional(),
  })
  .passthrough();

const rawMessageSchema = z
  .object({
    message_id: safeInteger,
    chat: z
      .object({
        id: safeInteger,
        type: z.string().min(1),
      })
      .passthrough(),
    text: z.string().optional(),
    voice: rawVoiceSchema.optional(),
    forward_origin: z.unknown().optional(),
    forward_date: safeInteger.optional(),
  })
  .passthrough();

const rawUpdateSchema = z
  .object({
    update_id: safeInteger.nonnegative(),
    message: rawMessageSchema.optional(),
  })
  .passthrough();

export function parseTelegramUpdate(value: unknown): TelegramUpdate | null {
  const parsed = rawUpdateSchema.safeParse(value);
  if (!parsed.success) return null;
  const message = parsed.data.message;
  return {
    updateId: parsed.data.update_id,
    ...(message
      ? {
          message: {
            messageId: message.message_id,
            chatId: message.chat.id,
            chatType: message.chat.type,
            ...(message.text !== undefined ? { text: message.text } : {}),
            ...(message.voice
              ? {
                  voice: {
                    fileId: message.voice.file_id,
                    duration: message.voice.duration,
                    ...(message.voice.file_size !== undefined
                      ? { fileSize: message.voice.file_size }
                      : {}),
                    ...(message.voice.mime_type
                      ? { mimeType: message.voice.mime_type }
                      : {}),
                  },
                }
              : {}),
            forwarded: Boolean(message.forward_origin ?? message.forward_date),
          },
        }
      : {}),
  };
}
