import type { Database as GeneratedDatabase } from './database.generated.ts';

export * from './database.generated.ts';

type GeneratedPublicSchema = GeneratedDatabase['public'];
type GeneratedMatchNotes = GeneratedPublicSchema['Functions']['match_notes'];
type GeneratedMatchNotesForUser =
  GeneratedPublicSchema['Functions']['match_notes_for_user'];
type GeneratedMatchNoteRow = GeneratedMatchNotes['Returns'][number];
type GeneratedCaptureNoteAtomic =
  GeneratedPublicSchema['Functions']['capture_note_atomic'];
type GeneratedCaptureNoteAtomicForUser =
  GeneratedPublicSchema['Functions']['capture_note_atomic_for_user'];
type GeneratedNotificationDigestNotes =
  GeneratedPublicSchema['Functions']['notification_digest_notes'];
type GeneratedClaimDueReviews =
  GeneratedPublicSchema['Functions']['claim_due_reviews'];
type GeneratedRevealReview =
  GeneratedPublicSchema['Functions']['reveal_review_for_user'];

/**
 * Supabase cannot infer nullability for individual `returns table` columns.
 * Keep this override aligned with the nullable note columns returned by
 * `public.match_notes`.
 */
export type MatchNoteRow = Omit<
  GeneratedMatchNoteRow,
  | 'personal_context'
  | 'recall_prompt'
  | 'source_title'
  | 'source_url'
  | 'summary'
> & {
  personal_context: string | null;
  recall_prompt: string | null;
  source_title: string | null;
  source_url: string | null;
  summary: string | null;
};

type CorrectedCaptureArgs<
  Args extends {
    input_personal_context: string;
    input_recall_prompt: string;
    input_source_title: string;
    input_source_url: string;
    input_summary: string;
  },
> = Omit<
  Args,
  | 'input_personal_context'
  | 'input_recall_prompt'
  | 'input_source_title'
  | 'input_source_url'
  | 'input_summary'
> & {
  input_personal_context: string | null;
  input_recall_prompt: string | null;
  input_source_title: string | null;
  input_source_url: string | null;
  input_summary: string | null;
};

type CorrectedCaptureReturns<
  Returns extends Array<{ stored_summary: string }>,
> = Array<
  Omit<Returns[number], 'stored_summary'> & { stored_summary: string | null }
>;

type CorrectedFunctions = Omit<
  GeneratedPublicSchema['Functions'],
  | 'capture_note_atomic'
  | 'capture_note_atomic_for_user'
  | 'claim_due_reviews'
  | 'match_notes'
  | 'match_notes_for_user'
  | 'notification_digest_notes'
  | 'reveal_review_for_user'
> & {
  capture_note_atomic: Omit<GeneratedCaptureNoteAtomic, 'Args' | 'Returns'> & {
    Args: CorrectedCaptureArgs<GeneratedCaptureNoteAtomic['Args']>;
    Returns: CorrectedCaptureReturns<GeneratedCaptureNoteAtomic['Returns']>;
  };
  capture_note_atomic_for_user: Omit<
    GeneratedCaptureNoteAtomicForUser,
    'Args' | 'Returns'
  > & {
    Args: CorrectedCaptureArgs<GeneratedCaptureNoteAtomicForUser['Args']>;
    Returns: CorrectedCaptureReturns<
      GeneratedCaptureNoteAtomicForUser['Returns']
    >;
  };
  claim_due_reviews: Omit<GeneratedClaimDueReviews, 'Returns'> & {
    Returns: Array<
      Omit<
        GeneratedClaimDueReviews['Returns'][number],
        'recall_prompt' | 'source_title'
      > & {
        recall_prompt: string | null;
        source_title: string | null;
      }
    >;
  };
  match_notes: Omit<GeneratedMatchNotes, 'Returns'> & {
    Returns: MatchNoteRow[];
  };
  match_notes_for_user: Omit<GeneratedMatchNotesForUser, 'Returns'> & {
    Returns: MatchNoteRow[];
  };
  notification_digest_notes: Omit<
    GeneratedNotificationDigestNotes,
    'Returns'
  > & {
    Returns: Array<
      Omit<
        GeneratedNotificationDigestNotes['Returns'][number],
        | 'personal_context'
        | 'recall_prompt'
        | 'source_title'
        | 'source_url'
        | 'summary'
      > & {
        personal_context: string | null;
        recall_prompt: string | null;
        source_title: string | null;
        source_url: string | null;
        summary: string | null;
      }
    >;
  };
  reveal_review_for_user: Omit<GeneratedRevealReview, 'Returns'> & {
    Returns: Array<
      Omit<GeneratedRevealReview['Returns'][number], 'source_title'> & {
        source_title: string | null;
      }
    >;
  };
};

/** Database contract used by Supabase clients in Novah. */
export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedPublicSchema, 'Functions'> & {
    Functions: CorrectedFunctions;
  };
};
