import { type PracticeEntry, type SearchMatch } from '@novah/shared/contracts';
import type { Database } from '@novah/shared/types';

import { supabase } from './supabase.ts';
import { localDateFor } from './time.ts';

export type NoteType = Database['public']['Enums']['note_type'];

export interface DashboardNote {
  id: string;
  originalText: string;
  personalContext: string | null;
  noteType: NoteType;
  sourceTitle: string | null;
  sourceUrl: string | null;
  captureChannel: Database['public']['Enums']['capture_channel'] | null;
  capturedAt: string;
  practice: DashboardPractice | null;
}

export interface DashboardPractice {
  noteId: string;
  status: 'active' | 'paused' | 'integrated';
  intervalDays: number;
  nextDueOn: string | null;
  pausedUntil: string | null;
  readyToResume: boolean;
  integratedAt: string | null;
  checkInsEnabled: boolean;
  nextCheckInOn: string | null;
  lastPractisedAt: string | null;
}

export type DashboardPracticeEntry = PracticeEntry;

export interface ProfileSettings {
  userId: string;
  timezone: string;
  practiceTime: string;
  telegramConnected: boolean;
}

export interface PracticePageData {
  localDate: string;
  activeCount: number;
  due: DashboardNote[];
  upcoming: DashboardNote[];
  readyToResume: DashboardNote[];
  integratedWaiting: DashboardNote[];
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
  'id, original_text, personal_context, note_type, source_title, source_url, capture_channel, captured_at';

type DashboardNoteRow = Pick<
  Database['public']['Tables']['notes']['Row'],
  | 'id'
  | 'original_text'
  | 'personal_context'
  | 'note_type'
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
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    captureChannel: row.capture_channel,
    capturedAt: row.captured_at,
    practice: null,
  };
}

export function searchMatchNote(match: SearchMatch): DashboardNote {
  return {
    id: match.noteId,
    originalText: match.originalText,
    personalContext: match.personalContext,
    noteType: match.noteType,
    sourceTitle: match.sourceTitle,
    sourceUrl: match.sourceUrl,
    captureChannel: null,
    capturedAt: match.capturedAt,
    practice: null,
  };
}

export async function loadProfile(userId: string): Promise<ProfileSettings> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, timezone, practice_time, telegram_chat_id')
    .eq('user_id', userId)
    .single();
  if (error || !data) throw new Error('Your settings could not be loaded.');
  return {
    userId: data.user_id,
    timezone: data.timezone,
    practiceTime: data.practice_time.slice(0, 5),
    telegramConnected: data.telegram_chat_id !== null,
  };
}

export async function loadLibraryPage(input: {
  userId: string;
  noteType: NoteType | 'all';
  practiceStatus?: 'saved' | 'active' | 'paused' | 'integrated';
  page: number;
  pageSize: number;
}): Promise<{ notes: DashboardNote[]; total: number }> {
  const rows: DashboardNoteRow[] = [];
  const fetchSize = 1_000;
  let query = supabase
    .from('notes')
    .select(NOTE_COLUMNS)
    .eq('user_id', input.userId)
    .order('captured_at', { ascending: false })
    .order('id', { ascending: false });
  if (input.noteType !== 'all') query = query.eq('note_type', input.noteType);
  for (let start = 0; ; start += fetchSize) {
    const { data, error } = await query.range(start, start + fetchSize - 1);
    if (error) throw new Error('Your collection could not be loaded.');
    const page = data ?? [];
    rows.push(...page);
    if (page.length < fetchSize) break;
  }
  const notes = rows.map(dashboardNote);
  const practiceByNote = await loadPracticeMap(
    input.userId,
    notes.map((note) => note.id),
  );
  const enriched = notes.map((note) => ({
    ...note,
    practice: practiceByNote.get(note.id) ?? null,
  }));
  const filtered = input.practiceStatus
    ? enriched.filter((note) =>
        input.practiceStatus === 'saved'
          ? note.practice === null
          : note.practice?.status === input.practiceStatus,
      )
    : enriched;
  const start = input.page * input.pageSize;
  return {
    notes: filtered.slice(start, start + input.pageSize),
    total: filtered.length,
  };
}

type PracticeRow = Database['public']['Tables']['note_practices']['Row'];

function dashboardPractice(row: PracticeRow): DashboardPractice {
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

export async function loadPracticeMap(
  userId: string,
  noteIds?: string[],
): Promise<Map<string, DashboardPractice>> {
  if (noteIds && noteIds.length === 0) return new Map();
  let query = supabase
    .from('note_practices')
    .select(
      'note_id, user_id, status, interval_days, next_due_on, paused_until, ready_to_resume, integrated_at, check_ins_enabled, next_check_in_on, last_practised_at, active_notification_claimed_at, active_notification_sent_on, check_in_notification_claimed_at, check_in_notification_sent_on, created_at, updated_at',
    )
    .eq('user_id', userId);
  if (noteIds) query = query.in('note_id', noteIds);
  const { data, error } = await query;
  if (error) throw new Error('Practice state could not be loaded.');
  return new Map(
    (data ?? []).map((row) => [row.note_id, dashboardPractice(row)]),
  );
}

export async function loadPracticeEntries(
  noteId: string,
): Promise<DashboardPracticeEntry[]> {
  const { data, error } = await supabase
    .from('practice_entries')
    .select('id, kind, text, source_channel, created_at')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error('Practice entries could not be loaded.');
  return (data ?? []).map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    text: entry.text,
    sourceChannel: entry.source_channel,
    createdAt: entry.created_at,
  }));
}

export async function loadPracticePage(
  userId: string,
  timezone: string,
  now = new Date(),
): Promise<PracticePageData> {
  const practiceByNote = await loadPracticeMap(userId);
  const noteIds = [...practiceByNote.keys()];
  const notes: DashboardNote[] = [];
  const batchSize = 100;
  for (let start = 0; start < noteIds.length; start += batchSize) {
    const { data, error } = await supabase
      .from('notes')
      .select(NOTE_COLUMNS)
      .eq('user_id', userId)
      .in('id', noteIds.slice(start, start + batchSize));
    if (error) throw new Error('Practice notes could not be loaded.');
    notes.push(
      ...(data ?? []).map((row) => {
        const note = dashboardNote(row);
        return { ...note, practice: practiceByNote.get(note.id) ?? null };
      }),
    );
  }
  const today = localDateFor(now, timezone);
  const active = notes.filter((note) => note.practice?.status === 'active');
  return {
    localDate: today,
    activeCount: active.length,
    due: active.filter((note) =>
      Boolean(note.practice?.nextDueOn && note.practice.nextDueOn <= today),
    ),
    upcoming: active.filter((note) =>
      Boolean(note.practice?.nextDueOn && note.practice.nextDueOn > today),
    ),
    readyToResume: notes.filter(
      (note) =>
        note.practice?.status === 'paused' && note.practice.readyToResume,
    ),
    integratedWaiting: notes.filter(
      (note) =>
        note.practice?.status === 'integrated' &&
        Boolean(
          note.practice.nextCheckInOn && note.practice.nextCheckInOn <= today,
        ),
    ),
  };
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

export async function updateProfileSettings(
  userId: string,
  values: Pick<ProfileSettings, 'timezone' | 'practiceTime'>,
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      timezone: values.timezone,
      practice_time: values.practiceTime,
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
