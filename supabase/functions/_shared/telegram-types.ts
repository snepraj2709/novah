import type {
  CaptureNoteRequest,
  CaptureNoteResponse,
  SearchNotesRequest,
  SearchNotesResponse,
} from './contracts.ts';

export interface TelegramVoice {
  fileId: string;
  duration: number;
  fileSize?: number;
  mimeType?: string;
}

export interface TelegramMessage {
  messageId: number;
  chatId: number;
  chatType: string;
  text?: string;
  voice?: TelegramVoice;
  replyToMessageId?: number;
  forwarded: boolean;
}

export type TelegramPracticeEntryIntent = 'reflection' | 'story';
export type TelegramPracticeEntrySource = 'telegram_text' | 'telegram_voice';

export interface TelegramUpdate {
  updateId: number;
  message?: TelegramMessage;
  callbackQuery?: TelegramCallbackQuery;
}

export interface TelegramCallbackQuery {
  id: string;
  chatId: number;
  chatType: string;
  data: string;
}

export interface TelegramPractice {
  noteId: string;
  originalText: string;
  sourceTitle: string | null;
  nextDueOn: string;
}

export interface TelegramSettings {
  timezone: string;
  practiceTime: string;
}

export interface TelegramRepository {
  claimUpdate(updateId: number): Promise<boolean>;
  userIdForChat(chatId: number): Promise<string | null>;
  consumeLinkCode(codeHash: string, chatId: number): Promise<string | null>;
  practices(userId: string): Promise<TelegramPractice[]>;
  settings(userId: string): Promise<TelegramSettings>;
  managePractice(
    userId: string,
    action: 'activate' | 'reread',
    noteId: string,
  ): Promise<void>;
  createReplyPrompt(
    userId: string,
    chatId: number,
    promptMessageId: number,
    noteId: string,
    intent: TelegramPracticeEntryIntent,
  ): Promise<void>;
  inspectReplyPrompt(
    userId: string,
    chatId: number,
    promptMessageId: number,
  ): Promise<TelegramPracticeEntryIntent>;
  consumePracticeReply(
    userId: string,
    chatId: number,
    promptMessageId: number,
    text: string,
    sourceChannel: TelegramPracticeEntrySource,
  ): Promise<TelegramPracticeEntryIntent>;
}

export interface TelegramKnowledgeService {
  capture(
    userId: string,
    request: CaptureNoteRequest,
  ): Promise<CaptureNoteResponse>;
  search(
    userId: string,
    request: SearchNotesRequest,
  ): Promise<SearchNotesResponse>;
}

export interface TelegramGateway {
  sendMessage(
    chatId: number,
    text: string,
    options?: TelegramMessageOptions,
  ): Promise<void>;
  sendForceReply(chatId: number, text: string): Promise<number>;
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
  downloadVoice(fileId: string, maximumBytes: number): Promise<Uint8Array>;
}

export interface TelegramMessageOptions {
  inlineKeyboard?: Array<Array<{ text: string; callbackData: string }>>;
}

export interface VoiceTranscriber {
  transcribe(audio: Uint8Array, mimeType: string): Promise<string>;
}
