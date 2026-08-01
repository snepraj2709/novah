import type { Database as GeneratedDatabase } from './database.generated.ts';

export * from './database.generated.ts';

type GeneratedPublicSchema = GeneratedDatabase['public'];
type GeneratedMatchNotes = GeneratedPublicSchema['Functions']['match_notes'];
type GeneratedMatchNoteRow = GeneratedMatchNotes['Returns'][number];
type GeneratedCaptureNoteAtomic =
  GeneratedPublicSchema['Functions']['capture_note_atomic'];

/**
 * Supabase cannot infer nullability for individual `returns table` columns.
 * Keep this override aligned with the nullable note columns returned by
 * `public.match_notes`.
 */
export type MatchNoteRow = Omit<
  GeneratedMatchNoteRow,
  'personal_context' | 'source_title' | 'source_url'
> & {
  personal_context: string | null;
  source_title: string | null;
  source_url: string | null;
};

type CorrectedFunctions = Omit<
  GeneratedPublicSchema['Functions'],
  'capture_note_atomic' | 'match_notes'
> & {
  capture_note_atomic: Omit<GeneratedCaptureNoteAtomic, 'Args'> & {
    Args: Omit<
      GeneratedCaptureNoteAtomic['Args'],
      'input_personal_context' | 'input_source_title' | 'input_source_url'
    > & {
      input_personal_context: string | null;
      input_source_title: string | null;
      input_source_url: string | null;
    };
  };
  match_notes: Omit<GeneratedMatchNotes, 'Returns'> & {
    Returns: MatchNoteRow[];
  };
};

/** Database contract used by Supabase clients in Novah. */
export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedPublicSchema, 'Functions'> & {
    Functions: CorrectedFunctions;
  };
};
