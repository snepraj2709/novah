import type { DailyDigest } from './contracts.ts';
import type { TelegramMessageOptions } from './telegram-types.ts';

export interface NotificationProfile {
  userId: string;
  chatId: number;
  timezone: string;
  digestTime: string;
  reviewTime: string;
}

export interface DigestEvidenceNote {
  noteId: string;
  originalText: string;
  personalContext: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
}

export interface ClaimedReview {
  eventId: string;
  noteId: string;
  stage: number;
  sourceTitle: string | null;
}

export interface NotificationRepository {
  profiles(): Promise<NotificationProfile[]>;
  digestEvidence(
    userId: string,
    digestDate: string,
  ): Promise<DigestEvidenceNote[]>;
  claimDigest(
    userId: string,
    digestDate: string,
    noteIds: string[],
    content: DailyDigest,
  ): Promise<string | null>;
  markDigestSent(digestId: string, sentAt: string): Promise<boolean>;
  claimReviews(
    userId: string,
    localDate: string,
    claimedAt: string,
  ): Promise<ClaimedReview[]>;
  markReviewsSent(eventIds: string[], sentAt: string): Promise<number>;
}

export interface DigestGenerator {
  generateDigest(input: {
    captureCount: number;
    sourceCount: number;
    notes: DigestEvidenceNote[];
  }): Promise<DailyDigest>;
}

export interface NotificationTelegramGateway {
  sendMessage(
    chatId: number,
    text: string,
    options?: TelegramMessageOptions,
  ): Promise<void>;
}
