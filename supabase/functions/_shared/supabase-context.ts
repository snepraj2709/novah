import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../packages/shared/src/types/database.ts';
import type { SearchMatch } from './contracts.ts';
import { ApiError } from './errors.ts';
import type {
  AtomicCaptureInput,
  AuthenticatedUser,
  Authenticator,
  NoteRepository,
  StoredCapture,
} from './types.ts';

export class SupabaseRequestContext implements Authenticator, NoteRepository {
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
    return { id: data.user.id };
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
      .select('id, original_text, note_type, summary, tags')
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
    const { data: review, error: reviewError } = await client
      .from('review_events')
      .select('due_on')
      .eq('note_id', note.id)
      .eq('stage', 1)
      .single();
    if (reviewError || !review)
      throw new ApiError(
        500,
        'internal_error',
        'Capture could not be checked.',
        true,
      );
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
    const client = this.authenticatedClient();
    const { data, error } = await client.rpc('capture_note_atomic', {
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
      summary: row.summary,
      tags: row.tags,
      recallPrompt: row.recall_prompt,
      sourceTitle: row.source_title,
      sourceUrl: row.source_url,
      capturedAt: row.captured_at,
      similarity: row.similarity,
    }));
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
