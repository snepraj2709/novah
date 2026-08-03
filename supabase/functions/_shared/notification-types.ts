import type { TelegramMessageOptions } from './telegram-types.ts';

export interface NotificationProfile {
  userId: string;
  chatId: number | null;
  timezone: string;
  practiceTime: string;
}

export interface ClaimedPractice {
  noteId: string;
  originalText: string;
  sourceTitle: string | null;
  nextDueOn: string;
}

export interface ClaimedReadyPractice {
  noteId: string;
  originalText: string;
  sourceTitle: string | null;
}

export interface ClaimedCheckIn extends ClaimedReadyPractice {
  nextCheckInOn: string;
}

export interface NotificationRepository {
  profiles(): Promise<NotificationProfile[]>;
  reconcileDuePauses(
    userId: string,
    localDate: string,
    now: string,
  ): Promise<void>;
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
  claimReadyPractices(
    userId: string,
    claimedAt: string,
  ): Promise<ClaimedReadyPractice[]>;
  markReadyPracticeSent(
    userId: string,
    noteId: string,
    localDate: string,
    claimedAt: string,
  ): Promise<boolean>;
  claimDueCheckIns(
    userId: string,
    localDate: string,
    claimedAt: string,
  ): Promise<ClaimedCheckIn[]>;
  markCheckInsSent(
    userId: string,
    noteIds: string[],
    localDate: string,
    claimedAt: string,
  ): Promise<boolean>;
}

export interface NotificationTelegramGateway {
  sendMessage(
    chatId: number,
    text: string,
    options?: TelegramMessageOptions,
  ): Promise<void>;
}
