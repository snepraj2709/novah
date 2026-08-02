import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../packages/shared/src/types/database.ts';
import type { SearchMatch } from './contracts.ts';
import { ApiError } from './errors.ts';
import type {
  AtomicCaptureInput,
  NoteRepository,
  StoredCapture,
} from './types.ts';
import type {
  TelegramDueReview,
  TelegramRepository,
  TelegramReviewReveal,
  TelegramSettings,
  TelegramTodayNote,
} from './telegram-types.ts';

function databaseFailure(message: string): ApiError {
  return new ApiError(500, 'internal_error', message, true);
}

function localDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export class SupabaseTelegramRepository implements TelegramRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly now: () => Date;

  constructor(
    url: string,
    serviceRoleKey: string,
    now: () => Date = () => new Date(),
  ) {
    this.client = createClient<Database>(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.now = now;
  }

  noteRepository(userId: string): NoteRepository {
    return new SupabaseServiceNoteRepository(this.client, userId);
  }

  async claimUpdate(updateId: number): Promise<boolean> {
    const { error } = await this.client
      .from('processed_telegram_updates')
      .insert({ update_id: updateId });
    if (!error) return true;
    if (error.code === '23505') return false;
    throw databaseFailure('Telegram update could not be claimed.');
  }

  async userIdForChat(chatId: number): Promise<string | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('user_id')
      .eq('telegram_chat_id', chatId)
      .maybeSingle();
    if (error) throw databaseFailure('Telegram account could not be checked.');
    return data?.user_id ?? null;
  }

  async consumeLinkCode(
    codeHash: string,
    chatId: number,
  ): Promise<string | null> {
    const { data, error } = await this.client.rpc(
      'consume_telegram_link_code',
      {
        input_code_hash: codeHash,
        input_chat_id: chatId,
      },
    );
    if (error) throw databaseFailure('Telegram link code could not be used.');
    return data;
  }

  private async profile(userId: string) {
    const { data, error } = await this.client
      .from('profiles')
      .select('timezone, digest_time, review_time')
      .eq('user_id', userId)
      .single();
    if (error || !data) throw databaseFailure('Profile could not be loaded.');
    return data;
  }

  async todayNotes(userId: string): Promise<TelegramTodayNote[]> {
    const profile = await this.profile(userId);
    const today = localDate(this.now(), profile.timezone);
    const { data, error } = await this.client
      .from('notes')
      .select('note_type, summary, captured_at')
      .eq('user_id', userId)
      .order('captured_at', { ascending: false })
      .limit(100);
    if (error) throw databaseFailure("Today's notes could not be loaded.");
    return (data ?? [])
      .filter(
        (note) =>
          localDate(new Date(note.captured_at), profile.timezone) === today,
      )
      .slice(0, 5)
      .map((note) => ({ noteType: note.note_type, summary: note.summary }));
  }

  async dueReviews(userId: string): Promise<TelegramDueReview[]> {
    const profile = await this.profile(userId);
    const today = localDate(this.now(), profile.timezone);
    const { data: reviews, error } = await this.client
      .from('review_events')
      .select('id, note_id, stage')
      .eq('user_id', userId)
      .in('status', ['pending', 'sent'])
      .lte('due_on', today)
      .order('due_on', { ascending: true })
      .limit(5);
    if (error) throw databaseFailure('Reviews could not be loaded.');
    if (!reviews?.length) return [];

    const noteIds = [...new Set(reviews.map((review) => review.note_id))];
    const { data: notes, error: notesError } = await this.client
      .from('notes')
      .select('id, recall_prompt, source_title')
      .eq('user_id', userId)
      .in('id', noteIds);
    if (notesError) throw databaseFailure('Reviews could not be loaded.');
    const byId = new Map((notes ?? []).map((note) => [note.id, note]));
    return reviews.flatMap((review) => {
      const note = byId.get(review.note_id);
      return note
        ? [
            {
              eventId: review.id,
              stage: review.stage,
              recallPrompt: note.recall_prompt,
              sourceTitle: note.source_title,
            },
          ]
        : [];
    });
  }

  async settings(userId: string): Promise<TelegramSettings> {
    const profile = await this.profile(userId);
    return {
      timezone: profile.timezone,
      digestTime: profile.digest_time,
      reviewTime: profile.review_time,
    };
  }

  async revealReview(
    userId: string,
    eventId: string,
  ): Promise<TelegramReviewReveal | null> {
    const { data, error } = await this.client.rpc('reveal_review_for_user', {
      input_user_id: userId,
      input_event_id: eventId,
    });
    if (error) throw databaseFailure('Review could not be revealed.');
    const row = data?.[0];
    return row
      ? { originalText: row.original_text, sourceTitle: row.source_title }
      : null;
  }

  async recordReviewFeedback(
    userId: string,
    eventId: string,
    status: 'remembered' | 'partial' | 'missed' | 'skipped',
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc(
      'record_review_feedback_for_user',
      {
        input_user_id: userId,
        input_event_id: eventId,
        input_status: status,
      },
    );
    if (error) throw databaseFailure('Review feedback could not be saved.');
    return data;
  }
}

class SupabaseServiceNoteRepository implements NoteRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;

  constructor(client: SupabaseClient<Database>, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  async findByClientRequestId(
    clientRequestId: string,
  ): Promise<StoredCapture | null> {
    const { data: note, error } = await this.client
      .from('notes')
      .select('id, original_text, note_type, summary, tags')
      .eq('user_id', this.userId)
      .eq('client_request_id', clientRequestId)
      .maybeSingle();
    if (error) throw databaseFailure('Capture could not be checked.');
    if (!note) return null;
    const { data: review, error: reviewError } = await this.client
      .from('review_events')
      .select('due_on')
      .eq('user_id', this.userId)
      .eq('note_id', note.id)
      .eq('stage', 1)
      .single();
    if (reviewError || !review)
      throw databaseFailure('Capture could not be checked.');
    return {
      id: note.id,
      originalText: note.original_text,
      noteType: note.note_type,
      summary: note.summary,
      tags: note.tags,
      firstReviewDate: review.due_on,
      created: false,
    };
  }

  async captureAtomic(input: AtomicCaptureInput): Promise<StoredCapture> {
    const { data, error } = await this.client.rpc(
      'capture_note_atomic_for_user',
      {
        input_user_id: this.userId,
        input_original_text: input.originalText,
        input_personal_context: input.personalContext ?? null,
        input_note_type: input.noteType,
        input_summary: input.summary,
        input_tags: input.tags,
        input_recall_prompt: input.recallPrompt,
        input_source_title: input.sourceTitle ?? null,
        input_source_url: input.sourceUrl ?? null,
        input_capture_channel: input.captureChannel,
        input_client_request_id: input.clientRequestId,
        input_embedding: `[${input.embedding.join(',')}]`,
      },
    );
    const row = data?.[0];
    if (error || !row) throw databaseFailure('Capture could not be saved.');
    return {
      id: row.note_id,
      originalText: row.stored_original_text,
      noteType: row.stored_note_type,
      summary: row.stored_summary,
      tags: row.stored_tags,
      firstReviewDate: row.first_review_date,
      created: row.created,
    };
  }

  async matchNotes(
    queryEmbedding: number[],
    matchCount: number,
  ): Promise<SearchMatch[]> {
    const { data, error } = await this.client.rpc('match_notes_for_user', {
      input_user_id: this.userId,
      query_embedding: `[${queryEmbedding.join(',')}]`,
      match_count: matchCount,
    });
    if (error) throw databaseFailure('Search could not be completed.');
    return (data ?? []).map((row) => ({
      noteId: row.note_id,
      originalText: row.original_text,
      personalContext: row.personal_context,
      noteType: row.note_type,
      summary: row.summary,
      tags: row.tags,
      recallPrompt: row.recall_prompt,
      sourceTitle: row.source_title,
      sourceUrl: row.source_url,
      capturedAt: row.captured_at,
      similarity: row.similarity,
    }));
  }
}
