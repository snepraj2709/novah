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
}

export interface TelegramTodayNote {
  noteType: string;
  summary: string;
}

export interface TelegramDueReview {
  stage: number;
  recallPrompt: string;
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
  sendMessage(chatId: number, text: string): Promise<void>;
  downloadVoice(fileId: string, maximumBytes: number): Promise<Uint8Array>;
}

export interface VoiceTranscriber {
  transcribe(audio: Uint8Array, mimeType: string): Promise<string>;
}
