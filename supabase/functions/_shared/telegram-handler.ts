import {
  MAX_TELEGRAM_MESSAGE_LENGTH,
  MAX_TELEGRAM_UPDATE_BYTES,
  MAX_TELEGRAM_VOICE_BYTES,
  MAX_TELEGRAM_VOICE_DURATION_SECONDS,
  TELEGRAM_LINK_CODE_LENGTH,
} from '../../../packages/shared/src/constants/index.ts';
import { ApiError, errorResponse } from './errors.ts';
import { parseJson } from './http.ts';
import { parseTelegramUpdate } from './telegram-contracts.ts';
import { hashTelegramLinkCode } from './telegram-link-handler.ts';
import type {
  TelegramCallbackQuery,
  TelegramGateway,
  TelegramKnowledgeService,
  TelegramMessage,
  TelegramMessageOptions,
  TelegramPractice,
  TelegramRepository,
  TelegramSettings,
  VoiceTranscriber,
} from './telegram-types.ts';

const LINK_CODE_PATTERN = new RegExp(
  `^[A-HJ-NP-Z2-9]{${TELEGRAM_LINK_CODE_LENGTH}}$`,
  'u',
);
const PRACTICE_CALLBACK_PATTERN =
  /^p:r:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu;
const TELEGRAM_NOTE_PREVIEW_LENGTH = 240;

export interface TelegramWebhookDependencies {
  webhookSecret: string;
  repository: TelegramRepository;
  knowledge: TelegramKnowledgeService;
  telegram: TelegramGateway;
  transcriber: VoiceTranscriber;
}

interface ParsedCommand {
  name: string;
  argument: string;
}

function acknowledgement(replayed = false): Response {
  return Response.json({ ok: true, ...(replayed ? { replayed: true } : {}) });
}

function parseCommand(text: string | undefined): ParsedCommand | null {
  const match = text
    ?.trim()
    .match(/^\/([a-z][a-z0-9_]*)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/iu);
  return match
    ? { name: match[1].toLowerCase(), argument: match[2]?.trim() ?? '' }
    : null;
}

function boundedMessage(text: string): string {
  return text.length <= MAX_TELEGRAM_MESSAGE_LENGTH
    ? text
    : `${text.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH - 1)}…`;
}

export function telegramNotePreview(text: string): string {
  const normalized = text
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const characters = Array.from(normalized);
  return characters.length <= TELEGRAM_NOTE_PREVIEW_LENGTH
    ? normalized || 'Untitled note'
    : `${characters.slice(0, TELEGRAM_NOTE_PREVIEW_LENGTH - 1).join('')}…`;
}

function linkInstructions(): string {
  return [
    'Link this private chat to Novah before saving or finding notes.',
    'Open Novah Settings, generate a code, then send /link CODE within ten minutes.',
  ].join('\n');
}

function commandHelp(linked: boolean): string {
  if (!linked) return linkInstructions();
  return [
    'Novah is linked.',
    'Send text or a voice note to save it.',
    'Commands: /find QUERY, /practice, /settings, /help.',
  ].join('\n');
}

function settingsMessage(settings: TelegramSettings): string {
  return [
    'Novah settings',
    `Timezone: ${settings.timezone}`,
    `Practice time: ${settings.practiceTime.slice(0, 5)}`,
    'Change these settings in the Novah web app.',
  ].join('\n');
}

function findMessage(
  result: Awaited<ReturnType<TelegramKnowledgeService['search']>>,
): string {
  if (result.matches.length === 0) {
    return 'No matching notes found. Try a different phrase.';
  }
  if (result.synthesisWithheld || !result.answer) {
    return [
      'Possible matches — evidence was too weak for a synthesized answer.',
      '',
      ...result.matches.map(
        (match, index) =>
          `[${index + 1}] ${telegramNotePreview(match.originalText)}`,
      ),
    ].join('\n');
  }
  const matchById = new Map(
    result.matches.map((match) => [match.noteId, match]),
  );
  const sources = result.citations.flatMap((citation) => {
    const match = matchById.get(citation.noteId);
    return match
      ? [`[${citation.number}] ${telegramNotePreview(match.originalText)}`]
      : [];
  });
  return [result.answer, '', 'Sources', ...sources].join('\n');
}

function practiceMessage(practice: TelegramPractice): string {
  return [
    'Practice',
    '',
    practice.originalText,
    ...(practice.sourceTitle ? ['', `Source: ${practice.sourceTitle}`] : []),
    '',
    `Next due: ${practice.nextDueOn}`,
  ].join('\n');
}

async function digestText(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}

export async function secureTelegramSecretMatches(
  expected: string,
  actual: string | null,
): Promise<boolean> {
  if (!actual || !expected) return false;
  const [expectedDigest, actualDigest] = await Promise.all([
    digestText(expected),
    digestText(actual),
  ]);
  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= expectedDigest[index] ^ actualDigest[index];
  }
  return difference === 0;
}

export async function telegramClientRequestId(
  updateId: number,
): Promise<string> {
  const bytes = await digestText(`telegram-update:${updateId}`);
  const uuid = bytes.slice(0, 16);
  uuid[6] = (uuid[6] & 0x0f) | 0x50;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  const hex = Array.from(uuid, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

async function send(
  telegram: TelegramGateway,
  chatId: number,
  text: string,
  options?: TelegramMessageOptions,
): Promise<void> {
  await telegram.sendMessage(chatId, boundedMessage(text), options);
}

async function dispatchCallback(
  callback: TelegramCallbackQuery,
  dependencies: TelegramWebhookDependencies,
): Promise<void> {
  if (callback.chatType !== 'private' || callback.chatId <= 0) return;
  const userId = await dependencies.repository.userIdForChat(callback.chatId);
  const noteId = callback.data.match(PRACTICE_CALLBACK_PATTERN)?.[1];
  if (!userId || !noteId) {
    await dependencies.telegram.answerCallbackQuery(
      callback.id,
      'This Practice action is unavailable.',
    );
    return;
  }
  await dependencies.repository.managePractice(userId, 'reread', noteId);
  await dependencies.telegram.answerCallbackQuery(
    callback.id,
    'Reread recorded.',
  );
}

async function linkChat(
  message: TelegramMessage,
  command: ParsedCommand,
  dependencies: TelegramWebhookDependencies,
): Promise<void> {
  const code = command.argument.toUpperCase();
  if (!LINK_CODE_PATTERN.test(code)) {
    await send(
      dependencies.telegram,
      message.chatId,
      'That link code is invalid or expired. Generate a new code in Novah Settings.',
    );
    return;
  }
  const userId = await dependencies.repository.consumeLinkCode(
    await hashTelegramLinkCode(code),
    message.chatId,
  );
  await send(
    dependencies.telegram,
    message.chatId,
    userId
      ? 'Telegram is now linked to Novah. Send text or a voice note to save it.'
      : 'That link code is invalid, expired, already used, or belongs to another linked chat.',
  );
}

async function captureText(
  userId: string,
  updateId: number,
  message: TelegramMessage,
  dependencies: TelegramWebhookDependencies,
): Promise<void> {
  const result = await dependencies.knowledge.capture(userId, {
    originalText: message.text ?? '',
    ...(message.forwarded ? { sourceTitle: 'Forwarded Telegram message' } : {}),
    captureChannel: 'telegram_text',
    clientRequestId: await telegramClientRequestId(updateId),
  });
  await send(
    dependencies.telegram,
    message.chatId,
    `Saved as ${result.note.noteType}.`,
  );
}

async function captureVoice(
  userId: string,
  updateId: number,
  message: TelegramMessage,
  dependencies: TelegramWebhookDependencies,
): Promise<void> {
  const voice = message.voice!;
  if (
    voice.duration > MAX_TELEGRAM_VOICE_DURATION_SECONDS ||
    (voice.fileSize !== undefined && voice.fileSize > MAX_TELEGRAM_VOICE_BYTES)
  ) {
    await send(
      dependencies.telegram,
      message.chatId,
      'Voice notes must be two minutes or less.',
    );
    return;
  }
  let audio: Uint8Array | null = null;
  let transcription: string;
  try {
    audio = await dependencies.telegram.downloadVoice(
      voice.fileId,
      MAX_TELEGRAM_VOICE_BYTES,
    );
    transcription = await dependencies.transcriber.transcribe(
      audio,
      'audio/ogg',
    );
  } finally {
    audio?.fill(0);
    audio = null;
  }
  const result = await dependencies.knowledge.capture(userId, {
    originalText: transcription,
    sourceTitle: 'Telegram voice note',
    captureChannel: 'telegram_voice',
    clientRequestId: await telegramClientRequestId(updateId),
  });
  await send(
    dependencies.telegram,
    message.chatId,
    `Saved voice note as ${result.note.noteType}.`,
  );
}

async function dispatchMessage(
  updateId: number,
  message: TelegramMessage,
  dependencies: TelegramWebhookDependencies,
): Promise<void> {
  if (message.chatType !== 'private' || message.chatId <= 0) return;
  const command = parseCommand(message.text);
  const linkedUserId = await dependencies.repository.userIdForChat(
    message.chatId,
  );

  if (command?.name === 'start') {
    await send(
      dependencies.telegram,
      message.chatId,
      commandHelp(Boolean(linkedUserId)),
    );
    return;
  }
  if (command?.name === 'link') {
    await linkChat(message, command, dependencies);
    return;
  }
  if (!linkedUserId) {
    await send(dependencies.telegram, message.chatId, linkInstructions());
    return;
  }
  if (command?.name === 'help') {
    await send(dependencies.telegram, message.chatId, commandHelp(true));
    return;
  }
  if (command?.name === 'find') {
    if (!command.argument) {
      await send(
        dependencies.telegram,
        message.chatId,
        'Use /find followed by a question.',
      );
      return;
    }
    const result = await dependencies.knowledge.search(linkedUserId, {
      query: command.argument,
      limit: 5,
    });
    await send(dependencies.telegram, message.chatId, findMessage(result));
    return;
  }
  if (command?.name === 'practice') {
    const practices = await dependencies.repository.practices(linkedUserId);
    if (practices.length === 0) {
      await send(dependencies.telegram, message.chatId, 'No active practices.');
    }
    for (const practice of practices) {
      await send(
        dependencies.telegram,
        message.chatId,
        practiceMessage(practice),
        {
          inlineKeyboard: [
            [{ text: 'Reread', callbackData: `p:r:${practice.noteId}` }],
          ],
        },
      );
    }
    return;
  }
  if (command?.name === 'settings') {
    await send(
      dependencies.telegram,
      message.chatId,
      settingsMessage(await dependencies.repository.settings(linkedUserId)),
    );
    return;
  }
  if (command) {
    await send(dependencies.telegram, message.chatId, commandHelp(true));
    return;
  }
  if (message.voice) {
    await captureVoice(linkedUserId, updateId, message, dependencies);
    return;
  }
  if (message.text?.trim()) {
    await captureText(linkedUserId, updateId, message, dependencies);
    return;
  }
  await send(
    dependencies.telegram,
    message.chatId,
    'Send text, a voice note, or /find followed by a question.',
  );
}

export async function handleTelegramWebhook(
  request: Request,
  dependencies: TelegramWebhookDependencies,
): Promise<Response> {
  const secretMatches = await secureTelegramSecretMatches(
    dependencies.webhookSecret,
    request.headers.get('X-Telegram-Bot-Api-Secret-Token'),
  );
  if (!secretMatches) {
    throw new ApiError(401, 'unauthorized', 'Webhook authentication failed.');
  }
  const update = parseTelegramUpdate(
    await parseJson(request, MAX_TELEGRAM_UPDATE_BYTES),
  );
  if (!update)
    throw new ApiError(400, 'bad_request', 'Telegram update is invalid.');
  if (!(await dependencies.repository.claimUpdate(update.updateId))) {
    return acknowledgement(true);
  }
  if (!update.message && !update.callbackQuery) return acknowledgement();

  try {
    if (update.callbackQuery) {
      await dispatchCallback(update.callbackQuery, dependencies);
    } else if (update.message) {
      await dispatchMessage(update.updateId, update.message, dependencies);
    }
  } catch {
    if (update.message?.chatType === 'private' && update.message.chatId > 0) {
      await dependencies.telegram
        .sendMessage(
          update.message.chatId,
          'Novah could not complete that request. Please try again with a new message.',
        )
        .catch(() => undefined);
    } else if (update.callbackQuery) {
      await dependencies.telegram
        .answerCallbackQuery(
          update.callbackQuery.id,
          'Novah could not complete that action.',
        )
        .catch(() => undefined);
    }
  }
  return acknowledgement();
}

export function createTelegramWebhookHandler(
  dependencies: TelegramWebhookDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'POST') {
      return errorResponse(
        new ApiError(
          405,
          'method_not_allowed',
          'Only POST requests are supported.',
        ),
      );
    }
    try {
      return await handleTelegramWebhook(request, dependencies);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
