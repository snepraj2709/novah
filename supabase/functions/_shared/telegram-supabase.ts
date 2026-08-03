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
  TelegramPractice,
  TelegramPracticeEntryIntent,
  TelegramPracticeEntrySource,
  TelegramRepository,
  TelegramSettings,
} from './telegram-types.ts';

function databaseFailure(message: string): ApiError {
  return new ApiError(500, 'internal_error', message, true);
}

function replyFailure(error: { message: string } | null): ApiError {
  return error?.message.includes('reply_expired')
    ? new ApiError(
        409,
        'reply_expired',
        'That Practice reply prompt has expired.',
      )
    : databaseFailure('Practice reply could not be processed.');
}

export class SupabaseTelegramRepository implements TelegramRepository {
  private readonly client: SupabaseClient<Database>;

  constructor(
    url: string,
    serviceRoleKey: string,
    _now: () => Date = () => new Date(),
  ) {
    this.client = createClient<Database>(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
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
      .select('timezone, practice_time')
      .eq('user_id', userId)
      .single();
    if (error || !data) throw databaseFailure('Profile could not be loaded.');
    return data;
  }

  async practices(userId: string): Promise<TelegramPractice[]> {
    const { data: practices, error } = await this.client
      .from('note_practices')
      .select('note_id, next_due_on')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('next_due_on', { ascending: true });
    if (error) throw databaseFailure('Practices could not be loaded.');
    if (!practices?.length) return [];
    const { data: notes, error: noteError } = await this.client
      .from('notes')
      .select('id, original_text, source_title')
      .eq('user_id', userId)
      .in(
        'id',
        practices.map((practice) => practice.note_id),
      );
    if (noteError) throw databaseFailure('Practices could not be loaded.');
    const byId = new Map((notes ?? []).map((note) => [note.id, note]));
    return practices.flatMap((practice) => {
      const note = byId.get(practice.note_id);
      return note && practice.next_due_on
        ? [
            {
              noteId: note.id,
              originalText: note.original_text,
              sourceTitle: note.source_title,
              nextDueOn: practice.next_due_on,
            },
          ]
        : [];
    });
  }

  async settings(userId: string): Promise<TelegramSettings> {
    const profile = await this.profile(userId);
    return {
      timezone: profile.timezone,
      practiceTime: profile.practice_time,
    };
  }

  async managePractice(
    userId: string,
    action: 'activate' | 'reread',
    noteId: string,
  ): Promise<void> {
    const { error } = await this.client.rpc('manage_practice_for_user', {
      input_user_id: userId,
      input_action: action,
      input_note_id: noteId,
    });
    if (error) throw databaseFailure('Practice could not be updated.');
  }

  async createReplyPrompt(
    userId: string,
    chatId: number,
    promptMessageId: number,
    noteId: string,
    intent: TelegramPracticeEntryIntent,
  ): Promise<void> {
    const { error } = await this.client.rpc('create_telegram_reply_prompt', {
      input_user_id: userId,
      input_chat_id: chatId,
      input_prompt_message_id: promptMessageId,
      input_note_id: noteId,
      input_intent: intent,
    });
    if (error)
      throw databaseFailure('Practice reply prompt could not be saved.');
  }

  async inspectReplyPrompt(
    userId: string,
    chatId: number,
    promptMessageId: number,
  ): Promise<TelegramPracticeEntryIntent> {
    const { data, error } = await this.client.rpc(
      'inspect_telegram_reply_prompt',
      {
        input_user_id: userId,
        input_chat_id: chatId,
        input_prompt_message_id: promptMessageId,
      },
    );
    if (error) throw replyFailure(error);
    if (data !== 'reflection' && data !== 'story') {
      throw databaseFailure('Practice reply prompt is invalid.');
    }
    return data;
  }

  async consumePracticeReply(
    userId: string,
    chatId: number,
    promptMessageId: number,
    text: string,
    sourceChannel: TelegramPracticeEntrySource,
  ): Promise<TelegramPracticeEntryIntent> {
    const { data, error } = await this.client.rpc(
      'consume_telegram_practice_reply',
      {
        input_user_id: userId,
        input_chat_id: chatId,
        input_prompt_message_id: promptMessageId,
        input_text: text,
        input_source_channel: sourceChannel,
      },
    );
    const row = data?.[0];
    if (error) throw replyFailure(error);
    if (!row) throw databaseFailure('Practice reply result is missing.');
    return row.entry_kind;
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
      .select('id, original_text, note_type')
      .eq('user_id', this.userId)
      .eq('client_request_id', clientRequestId)
      .maybeSingle();
    if (error) throw databaseFailure('Capture could not be checked.');
    if (!note) return null;
    return {
      id: note.id,
      originalText: note.original_text,
      noteType: note.note_type,
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
        input_summary: null,
        input_tags: [],
        input_recall_prompt: null,
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
      sourceTitle: row.source_title,
      sourceUrl: row.source_url,
      capturedAt: row.captured_at,
      similarity: row.similarity,
    }));
  }
}
