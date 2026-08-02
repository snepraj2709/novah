import {
  dailyDigestSchema,
  type DailyDigest,
  type SearchMatch,
} from '@novah/shared/contracts';
import type { Database } from '@novah/shared/types';

import { supabase } from './supabase.ts';
import { candidateUtcRange, localDateFor } from './time.ts';

export type NoteType = Database['public']['Enums']['note_type'];
export type ReviewStatus = Database['public']['Enums']['review_status'];

export interface DashboardNote {
  id: string;
  originalText: string;
  personalContext: string | null;
  noteType: NoteType;
  summary: string;
  tags: string[];
  recallPrompt: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  captureChannel: Database['public']['Enums']['capture_channel'] | null;
  capturedAt: string;
}

export interface ProfileSettings {
  userId: string;
  timezone: string;
  digestTime: string;
  reviewTime: string;
  telegramConnected: boolean;
}

export interface TodayData {
  localDate: string;
  notes: DashboardNote[];
  digest: DailyDigest | null;
}

export interface ReviewItem {
  id: string;
  noteId: string;
  stage: number;
  dueOn: string;
  status: ReviewStatus;
  answeredAt: string | null;
  prompt: string;
  sourceTitle: string | null;
}

export interface ReviewData {
  due: ReviewItem[];
  completed: ReviewItem[];
  upcoming: ReviewItem[];
}

export const NOTE_TYPES: Array<{ value: NoteType | 'all'; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'quote', label: 'Quotes' },
  { value: 'argument', label: 'Arguments' },
  { value: 'lesson', label: 'Lessons' },
  { value: 'observation', label: 'Observations' },
  { value: 'reflection', label: 'Reflections' },
  { value: 'principle', label: 'Principles' },
  { value: 'conversation_note', label: 'Conversations' },
];

const NOTE_COLUMNS =
  'id, original_text, personal_context, note_type, summary, tags, recall_prompt, source_title, source_url, capture_channel, captured_at';

type DashboardNoteRow = Pick<
  Database['public']['Tables']['notes']['Row'],
  | 'id'
  | 'original_text'
  | 'personal_context'
  | 'note_type'
  | 'summary'
  | 'tags'
  | 'recall_prompt'
  | 'source_title'
  | 'source_url'
  | 'capture_channel'
  | 'captured_at'
>;

function dashboardNote(row: DashboardNoteRow): DashboardNote {
  return {
    id: row.id,
    originalText: row.original_text,
    personalContext: row.personal_context,
    noteType: row.note_type,
    summary: row.summary,
    tags: row.tags,
    recallPrompt: row.recall_prompt,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    captureChannel: row.capture_channel,
    capturedAt: row.captured_at,
  };
}

async function loadNotesInUtcRange(
  userId: string,
  startAt: string,
  endAt: string,
): Promise<DashboardNoteRow[]> {
  const notes: DashboardNoteRow[] = [];
  const pageSize = 1_000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('notes')
      .select(NOTE_COLUMNS)
      .eq('user_id', userId)
      .gte('captured_at', startAt)
      .lt('captured_at', endAt)
      .order('captured_at', { ascending: false })
      .order('id', { ascending: false })
      .range(start, start + pageSize - 1);
    if (error) throw new Error("Today's notes could not be loaded.");
    const page = data ?? [];
    notes.push(...page);
    if (page.length < pageSize) return notes;
  }
}

export function searchMatchNote(match: SearchMatch): DashboardNote {
  return {
    id: match.noteId,
    originalText: match.originalText,
    personalContext: match.personalContext,
    noteType: match.noteType,
    summary: match.summary,
    tags: match.tags,
    recallPrompt: match.recallPrompt,
    sourceTitle: match.sourceTitle,
    sourceUrl: match.sourceUrl,
    captureChannel: null,
    capturedAt: match.capturedAt,
  };
}

export async function loadProfile(userId: string): Promise<ProfileSettings> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, timezone, digest_time, review_time, telegram_chat_id')
    .eq('user_id', userId)
    .single();
  if (error || !data) throw new Error('Your settings could not be loaded.');
  return {
    userId: data.user_id,
    timezone: data.timezone,
    digestTime: data.digest_time.slice(0, 5),
    reviewTime: data.review_time.slice(0, 5),
    telegramConnected: data.telegram_chat_id !== null,
  };
}

export async function loadToday(
  userId: string,
  timezone: string,
  now = new Date(),
): Promise<TodayData> {
  const localDate = localDateFor(now, timezone);
  const range = candidateUtcRange(localDate);
  const [noteRows, digestResult] = await Promise.all([
    loadNotesInUtcRange(userId, range.start, range.end),
    supabase
      .from('daily_digests')
      .select('content')
      .eq('user_id', userId)
      .eq('digest_date', localDate)
      .maybeSingle(),
  ]);
  if (digestResult.error)
    throw new Error("Today's digest could not be loaded.");
  const notes = noteRows
    .filter(
      (note) =>
        localDateFor(new Date(note.captured_at), timezone) === localDate,
    )
    .map(dashboardNote);
  const parsedDigest = digestResult.data
    ? dailyDigestSchema.safeParse(digestResult.data.content)
    : null;
  if (parsedDigest && !parsedDigest.success) {
    throw new Error("Today's digest has an invalid stored format.");
  }
  return {
    localDate,
    notes,
    digest: parsedDigest?.data ?? null,
  };
}

export async function loadLibraryPage(input: {
  userId: string;
  noteType: NoteType | 'all';
  page: number;
  pageSize: number;
}): Promise<{ notes: DashboardNote[]; total: number }> {
  const start = input.page * input.pageSize;
  let query = supabase
    .from('notes')
    .select(NOTE_COLUMNS, { count: 'exact' })
    .eq('user_id', input.userId)
    .order('captured_at', { ascending: false })
    .order('id', { ascending: false })
    .range(start, start + input.pageSize - 1);
  if (input.noteType !== 'all') query = query.eq('note_type', input.noteType);
  const { data, error, count } = await query;
  if (error) throw new Error('Your library could not be loaded.');
  return { notes: (data ?? []).map(dashboardNote), total: count ?? 0 };
}

export async function deleteOwnedNote(noteId: string): Promise<void> {
  const { data, error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId)
    .select('id');
  if (error) throw new Error('The note could not be deleted.');
  if (data.length !== 1) throw new Error('The note is no longer available.');
}

export async function loadReviews(
  userId: string,
  timezone: string,
  now = new Date(),
): Promise<ReviewData> {
  const today = localDateFor(now, timezone);
  type ReviewEventRow = Pick<
    Database['public']['Tables']['review_events']['Row'],
    'id' | 'note_id' | 'stage' | 'due_on' | 'status' | 'answered_at'
  >;
  type ReviewNoteRow = Pick<
    Database['public']['Tables']['notes']['Row'],
    'id' | 'recall_prompt' | 'source_title'
  >;
  const events: ReviewEventRow[] = [];
  const pageSize = 1_000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('review_events')
      .select('id, note_id, stage, due_on, status, answered_at')
      .eq('user_id', userId)
      .order('due_on', { ascending: true })
      .order('id', { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw new Error('Reviews could not be loaded.');
    const page = data ?? [];
    events.push(...page);
    if (page.length < pageSize) break;
  }

  const noteIds = [...new Set(events.map((event) => event.note_id))];
  const notes: ReviewNoteRow[] = [];
  const noteBatchSize = 100;
  for (let start = 0; start < noteIds.length; start += noteBatchSize) {
    const { data, error } = await supabase
      .from('notes')
      .select('id, recall_prompt, source_title')
      .eq('user_id', userId)
      .in('id', noteIds.slice(start, start + noteBatchSize));
    if (error) throw new Error('Review notes could not be loaded.');
    notes.push(...(data ?? []));
  }
  const noteById = new Map(notes.map((note) => [note.id, note]));
  const items = events.flatMap((event) => {
    const note = noteById.get(event.note_id);
    return note
      ? [
          {
            id: event.id,
            noteId: event.note_id,
            stage: event.stage,
            dueOn: event.due_on,
            status: event.status,
            answeredAt: event.answered_at,
            prompt: note.recall_prompt,
            sourceTitle: note.source_title,
          } satisfies ReviewItem,
        ]
      : [];
  });
  const completedStatuses = new Set<ReviewStatus>([
    'remembered',
    'partial',
    'missed',
    'skipped',
  ]);
  return {
    due: items.filter(
      (item) => !completedStatuses.has(item.status) && item.dueOn <= today,
    ),
    completed: items
      .filter((item) => completedStatuses.has(item.status))
      .sort((left, right) =>
        (right.answeredAt ?? '').localeCompare(left.answeredAt ?? ''),
      ),
    upcoming: items.filter(
      (item) => !completedStatuses.has(item.status) && item.dueOn > today,
    ),
  };
}

export async function updateProfileSettings(
  userId: string,
  values: Pick<ProfileSettings, 'timezone' | 'digestTime' | 'reviewTime'>,
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      timezone: values.timezone,
      digest_time: values.digestTime,
      review_time: values.reviewTime,
    })
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw new Error('Settings could not be saved.');
  if (data.length !== 1)
    throw new Error('Your profile is no longer available.');
}

export async function loadAllNotes(userId: string): Promise<DashboardNote[]> {
  const notes: DashboardNote[] = [];
  const pageSize = 1_000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('notes')
      .select(NOTE_COLUMNS)
      .eq('user_id', userId)
      .order('captured_at', { ascending: false })
      .order('id', { ascending: false })
      .range(start, start + pageSize - 1);
    if (error) throw new Error('Your export could not be prepared.');
    const page = (data ?? []).map(dashboardNote);
    notes.push(...page);
    if (page.length < pageSize) return notes;
  }
}
