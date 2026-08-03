import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../packages/shared/src/types/database.ts';
import { ApiError } from './errors.ts';
import type {
  ClaimedPractice,
  NotificationProfile,
  NotificationRepository,
} from './notification-types.ts';

function databaseFailure(): ApiError {
  return new ApiError(
    500,
    'internal_error',
    'Practice notifications could not be processed.',
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
    const rows: NotificationProfile[] = [];
    const pageSize = 1_000;
    for (let start = 0; ; start += pageSize) {
      const { data, error } = await this.client
        .from('profiles')
        .select('user_id, telegram_chat_id, timezone, practice_time')
        .not('telegram_chat_id', 'is', null)
        .order('user_id', { ascending: true })
        .range(start, start + pageSize - 1);
      if (error) throw databaseFailure();
      const page = data ?? [];
      rows.push(
        ...page.flatMap((profile) =>
          profile.telegram_chat_id === null
            ? []
            : [
                {
                  userId: profile.user_id,
                  chatId: profile.telegram_chat_id,
                  timezone: profile.timezone,
                  practiceTime: profile.practice_time,
                },
              ],
        ),
      );
      if (page.length < pageSize) return rows;
    }
  }

  async claimDuePractices(
    userId: string,
    localDate: string,
    claimedAt: string,
  ): Promise<ClaimedPractice[]> {
    const { data, error } = await this.client.rpc('claim_due_practices', {
      input_user_id: userId,
      input_local_date: localDate,
      input_claimed_at: claimedAt,
    });
    if (error) throw databaseFailure();
    return (data ?? []).map((practice) => ({
      noteId: practice.note_id,
      originalText: practice.original_text,
      sourceTitle: practice.source_title,
      nextDueOn: practice.next_due_on,
    }));
  }

  async markPracticeSent(
    userId: string,
    noteId: string,
    localDate: string,
    sentAt: string,
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc(
      'mark_practice_notification_sent',
      {
        input_user_id: userId,
        input_note_id: noteId,
        input_local_date: localDate,
        input_sent_at: sentAt,
      },
    );
    if (error) throw databaseFailure();
    return data;
  }
}
