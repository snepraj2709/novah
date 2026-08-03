import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../packages/shared/src/types/database.ts';
import { ApiError } from './errors.ts';
import type {
  ClaimedCheckIn,
  ClaimedPractice,
  ClaimedReadyPractice,
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
        .order('user_id', { ascending: true })
        .range(start, start + pageSize - 1);
      if (error) throw databaseFailure();
      const page = data ?? [];
      rows.push(
        ...page.map((profile) => ({
          userId: profile.user_id,
          chatId: profile.telegram_chat_id,
          timezone: profile.timezone,
          practiceTime: profile.practice_time,
        })),
      );
      if (page.length < pageSize) return rows;
    }
  }

  async reconcileDuePauses(
    userId: string,
    localDate: string,
    now: string,
  ): Promise<void> {
    const { error } = await this.client.rpc('reconcile_due_pauses', {
      input_user_id: userId,
      input_local_date: localDate,
      input_now: now,
    });
    if (error) throw databaseFailure();
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

  async claimReadyPractices(
    userId: string,
    claimedAt: string,
  ): Promise<ClaimedReadyPractice[]> {
    const { data, error } = await this.client.rpc('claim_ready_practices', {
      input_user_id: userId,
      input_claimed_at: claimedAt,
    });
    if (error) throw databaseFailure();
    return (data ?? []).map((practice) => ({
      noteId: practice.note_id,
      originalText: practice.original_text,
      sourceTitle: practice.source_title,
    }));
  }

  async markReadyPracticeSent(
    userId: string,
    noteId: string,
    localDate: string,
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc('mark_ready_practice_sent', {
      input_user_id: userId,
      input_note_id: noteId,
      input_local_date: localDate,
    });
    if (error) throw databaseFailure();
    return data;
  }

  async claimDueCheckIns(
    userId: string,
    localDate: string,
    claimedAt: string,
  ): Promise<ClaimedCheckIn[]> {
    const { data, error } = await this.client.rpc('claim_due_check_ins', {
      input_user_id: userId,
      input_local_date: localDate,
      input_claimed_at: claimedAt,
    });
    if (error) throw databaseFailure();
    return (data ?? []).map((practice) => ({
      noteId: practice.note_id,
      originalText: practice.original_text,
      sourceTitle: practice.source_title,
      nextCheckInOn: practice.next_check_in_on,
    }));
  }

  async markCheckInsSent(
    userId: string,
    noteIds: string[],
    localDate: string,
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc('mark_check_ins_sent', {
      input_user_id: userId,
      input_note_ids: noteIds,
      input_local_date: localDate,
    });
    if (error) throw databaseFailure();
    return data;
  }
}
