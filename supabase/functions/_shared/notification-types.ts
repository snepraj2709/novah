import type { TelegramMessageOptions } from './telegram-types.ts';

export interface NotificationProfile {
  userId: string;
  chatId: number;
  timezone: string;
  practiceTime: string;
}

export interface ClaimedPractice {
  noteId: string;
  originalText: string;
  sourceTitle: string | null;
  nextDueOn: string;
}

export interface NotificationRepository {
  profiles(): Promise<NotificationProfile[]>;
  claimDuePractices(
    userId: string,
    localDate: string,
    claimedAt: string,
  ): Promise<ClaimedPractice[]>;
  markPracticeSent(
    userId: string,
    noteId: string,
    localDate: string,
    sentAt: string,
  ): Promise<boolean>;
}

export interface NotificationTelegramGateway {
  sendMessage(
    chatId: number,
    text: string,
    options?: TelegramMessageOptions,
  ): Promise<void>;
}
