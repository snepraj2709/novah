import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../packages/shared/src/types/database.ts';
import { ApiError } from './errors.ts';
import type {
  ClaimedReview,
  DigestEvidenceNote,
  NotificationProfile,
  NotificationRepository,
} from './notification-types.ts';

function databaseFailure(): ApiError {
  return new ApiError(
    500,
    'internal_error',
    'Notification data could not be processed.',
    true,
  );
}

export class SupabaseNotificationRepository implements NotificationRepository {
  private readonly client: SupabaseClient<Database>;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient<Database>(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async profiles(): Promise<NotificationProfile[]> {
    type ProfileRow = Pick<
      Database['public']['Tables']['profiles']['Row'],
      | 'user_id'
      | 'telegram_chat_id'
      | 'timezone'
      | 'digest_time'
      | 'review_time'
    >;
    const rows: ProfileRow[] = [];
    const pageSize = 1_000;
    for (let start = 0; ; start += pageSize) {
      const { data, error } = await this.client
        .from('profiles')
        .select('user_id, telegram_chat_id, timezone, digest_time, review_time')
        .not('telegram_chat_id', 'is', null)
        .order('user_id', { ascending: true })
        .range(start, start + pageSize - 1);
      if (error) throw databaseFailure();
      const page = data ?? [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows.flatMap((profile) =>
      profile.telegram_chat_id === null
        ? []
        : [
            {
              userId: profile.user_id,
              chatId: profile.telegram_chat_id,
              timezone: profile.timezone,
              digestTime: profile.digest_time,
              reviewTime: profile.review_time,
            },
          ],
    );
  }

  async digestEvidence(
    userId: string,
    digestDate: string,
  ): Promise<DigestEvidenceNote[]> {
    const evidence: DigestEvidenceNote[] = [];
    const pageSize = 1_000;
    for (let start = 0; ; start += pageSize) {
      const { data, error } = await this.client
        .rpc('notification_digest_notes', {
          input_user_id: userId,
          input_digest_date: digestDate,
        })
        .range(start, start + pageSize - 1);
      if (error) throw databaseFailure();
      const page = data ?? [];
      evidence.push(
        ...page.map((note) => ({
          noteId: note.note_id,
          originalText: note.original_text,
          personalContext: note.personal_context,
          summary: note.summary,
          recallPrompt: note.recall_prompt,
          sourceTitle: note.source_title,
          sourceUrl: note.source_url,
        })),
      );
      if (page.length < pageSize) return evidence;
    }
  }

  async claimDigest(
    userId: string,
    digestDate: string,
    noteIds: string[],
    content: Parameters<NotificationRepository['claimDigest']>[3],
  ): Promise<string | null> {
    const { data, error } = await this.client.rpc('claim_daily_digest', {
      input_user_id: userId,
      input_digest_date: digestDate,
      input_note_ids: noteIds,
      input_content: content,
    });
    if (error) throw databaseFailure();
    return data;
  }

  async markDigestSent(digestId: string, sentAt: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('mark_daily_digest_sent', {
      input_digest_id: digestId,
      input_sent_at: sentAt,
    });
    if (error) throw databaseFailure();
    return data;
  }

  async claimReviews(
    userId: string,
    localDate: string,
    claimedAt: string,
  ): Promise<ClaimedReview[]> {
    const { data, error } = await this.client.rpc('claim_due_reviews', {
      input_user_id: userId,
      input_local_date: localDate,
      input_claimed_at: claimedAt,
    });
    if (error) throw databaseFailure();
    return (data ?? []).map((review) => ({
      eventId: review.event_id,
      noteId: review.note_id,
      stage: review.stage,
      recallPrompt: review.recall_prompt,
      sourceTitle: review.source_title,
    }));
  }

  async markReviewsSent(eventIds: string[], sentAt: string): Promise<number> {
    const { data, error } = await this.client.rpc('mark_review_packet_sent', {
      input_event_ids: eventIds,
      input_sent_at: sentAt,
    });
    if (error) throw databaseFailure();
    return data;
  }
}
