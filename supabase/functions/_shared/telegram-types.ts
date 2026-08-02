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
  forwarded: boolean;
}

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

export interface TelegramTodayNote {
  noteType: string;
  summary: string;
}

export interface TelegramDueReview {
  eventId: string;
  stage: number;
  recallPrompt: string;
  sourceTitle: string | null;
}

export interface TelegramReviewReveal {
  originalText: string;
  sourceTitle: string | null;
}

export interface TelegramSettings {
  timezone: string;
  digestTime: string;
  reviewTime: string;
}

export interface TelegramRepository {
  claimUpdate(updateId: number): Promise<boolean>;
  userIdForChat(chatId: number): Promise<string | null>;
  consumeLinkCode(codeHash: string, chatId: number): Promise<string | null>;
  todayNotes(userId: string): Promise<TelegramTodayNote[]>;
  dueReviews(userId: string): Promise<TelegramDueReview[]>;
  settings(userId: string): Promise<TelegramSettings>;
  revealReview(
    userId: string,
    eventId: string,
  ): Promise<TelegramReviewReveal | null>;
  recordReviewFeedback(
    userId: string,
    eventId: string,
    status: 'remembered' | 'partial' | 'missed' | 'skipped',
  ): Promise<boolean>;
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
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
  downloadVoice(fileId: string, maximumBytes: number): Promise<Uint8Array>;
}

export interface TelegramMessageOptions {
  inlineKeyboard?: Array<Array<{ text: string; callbackData: string }>>;
}

export interface VoiceTranscriber {
  transcribe(audio: Uint8Array, mimeType: string): Promise<string>;
}
