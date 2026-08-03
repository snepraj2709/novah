import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../packages/shared/src/types/database.ts';
import type { SearchMatch } from './contracts.ts';
import { ApiError } from './errors.ts';
import { passwordAuthenticationTime } from './auth-claims.ts';
import type {
  AtomicCaptureInput,
  AuthenticatedUser,
  Authenticator,
  NoteRepository,
  StoredCapture,
} from './types.ts';
import type {
  PracticeLifecycleRequest,
  PracticeRepository,
} from './practice-types.ts';
import type { PracticeEntry, PracticeState } from './contracts.ts';

export class SupabaseRequestContext
  implements Authenticator, NoteRepository, PracticeRepository
{
  private client: SupabaseClient<Database> | null = null;
  constructor(
    private readonly url: string,
    private readonly publishableKey: string,
  ) {}

  async authenticate(request: Request): Promise<AuthenticatedUser> {
    const authorization = request.headers.get('Authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/iu);
    if (!match)
      throw new ApiError(401, 'unauthorized', 'Authentication is required.');
    const accessToken = match[1];
    const client = createClient<Database>(this.url, this.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user)
      throw new ApiError(401, 'unauthorized', 'Authentication is required.');
    this.client = client;
    const passwordAuthenticatedAt = passwordAuthenticationTime(accessToken);
    return {
      id: data.user.id,
      ...(passwordAuthenticatedAt ? { passwordAuthenticatedAt } : {}),
    };
  }

  private authenticatedClient(): SupabaseClient<Database> {
    if (!this.client)
      throw new ApiError(401, 'unauthorized', 'Authentication is required.');
    return this.client;
  }

  async findByClientRequestId(
    clientRequestId: string,
  ): Promise<StoredCapture | null> {
    const client = this.authenticatedClient();
    const { data: note, error: noteError } = await client
      .from('notes')
      .select('id, original_text, note_type')
      .eq('client_request_id', clientRequestId)
      .maybeSingle();
    if (noteError)
      throw new ApiError(
        500,
        'internal_error',
        'Capture could not be checked.',
        true,
      );
    if (!note) return null;
    return {
      id: note.id,
      originalText: note.original_text,
      noteType: note.note_type,
      created: false,
    };
  }

  async captureAtomic(input: AtomicCaptureInput): Promise<StoredCapture> {
    const client = this.authenticatedClient();
    const { data, error } = await client.rpc('capture_note_atomic', {
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
    });
    const row = data?.[0];
    if (error || !row)
      throw new ApiError(
        500,
        'internal_error',
        'Capture could not be saved.',
        true,
      );
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
    const client = this.authenticatedClient();
    const { data, error } = await client.rpc('match_notes', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      match_count: matchCount,
    });
    if (error)
      throw new ApiError(
        500,
        'internal_error',
        'Search could not be completed.',
        true,
      );
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

  async managePractice(
    request: PracticeLifecycleRequest,
  ): Promise<PracticeState> {
    const client = this.authenticatedClient();
    const { data, error } = await client.rpc('manage_practice', {
      input_action: request.action,
      input_note_id: request.noteId,
      ...(request.action === 'setInterval'
        ? { input_interval_days: request.intervalDays }
        : {}),
      ...(request.action === 'pause' && request.resumeOn
        ? { input_resume_on: request.resumeOn }
        : {}),
    });
    if (error) {
      const code = error.message.match(
        /(practice_slots_full|practice_not_found|invalid_transition|stale_action)/u,
      )?.[1];
      if (code === 'practice_slots_full') {
        throw new ApiError(409, code, 'All three Practice slots are in use.');
      }
      if (code === 'practice_not_found') {
        throw new ApiError(404, code, 'The note or Practice was not found.');
      }
      if (code === 'invalid_transition') {
        throw new ApiError(409, code, 'That Practice action is not available.');
      }
      if (code === 'stale_action') {
        throw new ApiError(
          409,
          code,
          'That Practice action is no longer current.',
        );
      }
      throw new ApiError(
        500,
        'internal_error',
        'Practice could not be updated.',
        true,
      );
    }
    const row = data?.[0];
    if (!row) {
      throw new ApiError(
        500,
        'internal_error',
        'Practice state is missing.',
        true,
      );
    }
    return {
      noteId: row.note_id,
      status: row.status,
      intervalDays: row.interval_days,
      nextDueOn: row.next_due_on,
      pausedUntil: row.paused_until,
      readyToResume: row.ready_to_resume,
      integratedAt: row.integrated_at,
      checkInsEnabled: row.check_ins_enabled,
      nextCheckInOn: row.next_check_in_on,
      lastPractisedAt: row.last_practised_at,
    };
  }

  async addEntry(
    noteId: string,
    entryKind: PracticeEntry['kind'],
    text: string,
    entryId: string,
  ): Promise<{ practice: PracticeState; entry: PracticeEntry }> {
    const client = this.authenticatedClient();
    const { data, error } = await client.rpc('add_practice_entry', {
      input_note_id: noteId,
      input_kind: entryKind,
      input_text: text,
      input_entry_id: entryId,
    });
    if (error) {
      const code = error.message.match(
        /(practice_not_found|invalid_transition|entry_too_long)/u,
      )?.[1];
      if (code === 'practice_not_found') {
        throw new ApiError(404, code, 'The note or Practice was not found.');
      }
      if (code === 'invalid_transition') {
        throw new ApiError(409, code, 'That Practice entry is invalid.');
      }
      if (code === 'entry_too_long') {
        throw new ApiError(413, code, 'That Practice entry is too long.');
      }
      throw new ApiError(
        500,
        'internal_error',
        'Practice entry could not be saved.',
        true,
      );
    }
    const row = data?.[0];
    if (!row) {
      throw new ApiError(
        500,
        'internal_error',
        'Practice entry state is missing.',
        true,
      );
    }
    return {
      practice: {
        noteId: row.note_id,
        status: row.status,
        intervalDays: row.interval_days,
        nextDueOn: row.next_due_on,
        pausedUntil: row.paused_until,
        readyToResume: row.ready_to_resume,
        integratedAt: row.integrated_at,
        checkInsEnabled: row.check_ins_enabled,
        nextCheckInOn: row.next_check_in_on,
        lastPractisedAt: row.last_practised_at,
      },
      entry: {
        id: row.entry_id,
        kind: row.entry_kind,
        text: row.entry_text,
        sourceChannel: row.entry_source_channel,
        createdAt: row.entry_created_at,
      },
    };
  }

  async createTelegramLinkCode(
    codeHash: string,
  ): Promise<{ expiresAt: string; connected: boolean }> {
    const client = this.authenticatedClient();
    const { data, error } = await client.rpc('create_telegram_link_code', {
      input_code_hash: codeHash,
    });
    const row = data?.[0];
    if (error || !row)
      throw new ApiError(
        500,
        'internal_error',
        'A Telegram link code could not be created.',
        true,
      );
    return {
      expiresAt: row.expires_at,
      connected: row.connected,
    };
  }
}
