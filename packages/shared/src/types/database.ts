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
type GeneratedClaimDuePractices =
  GeneratedPublicSchema['Functions']['claim_due_practices'];
type GeneratedAddPracticeEntry =
  GeneratedPublicSchema['Functions']['add_practice_entry'];
type GeneratedAddPracticeEntryCore =
  GeneratedPublicSchema['Functions']['add_practice_entry_core'];
type GeneratedAddPracticeEntryForUser =
  GeneratedPublicSchema['Functions']['add_practice_entry_for_user'];
type GeneratedConsumeTelegramPracticeReply =
  GeneratedPublicSchema['Functions']['consume_telegram_practice_reply'];
type GeneratedManagePractice =
  GeneratedPublicSchema['Functions']['manage_practice'];
type GeneratedManagePracticeCore =
  GeneratedPublicSchema['Functions']['manage_practice_core'];
type GeneratedManagePracticeForUser =
  GeneratedPublicSchema['Functions']['manage_practice_for_user'];
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

type CorrectedPracticeReturns<
  Returns extends Array<{
    integrated_at: string;
    last_practised_at: string;
    next_check_in_on: string;
    next_due_on: string;
    paused_until: string;
  }>,
> = Array<
  Omit<
    Returns[number],
    | 'integrated_at'
    | 'last_practised_at'
    | 'next_check_in_on'
    | 'next_due_on'
    | 'paused_until'
  > & {
    integrated_at: string | null;
    last_practised_at: string | null;
    next_check_in_on: string | null;
    next_due_on: string | null;
    paused_until: string | null;
  }
>;

type CorrectedPracticeEntryReturns<
  Returns extends Array<{
    integrated_at: string;
    last_practised_at: string;
    next_check_in_on: string;
    next_due_on: string;
    paused_until: string;
  }>,
> = CorrectedPracticeReturns<Returns>;

type CorrectedFunctions = Omit<
  GeneratedPublicSchema['Functions'],
  | 'add_practice_entry'
  | 'add_practice_entry_core'
  | 'add_practice_entry_for_user'
  | 'capture_note_atomic'
  | 'capture_note_atomic_for_user'
  | 'claim_due_practices'
  | 'claim_due_reviews'
  | 'consume_telegram_practice_reply'
  | 'manage_practice'
  | 'manage_practice_core'
  | 'manage_practice_for_user'
  | 'match_notes'
  | 'match_notes_for_user'
  | 'notification_digest_notes'
  | 'reveal_review_for_user'
> & {
  add_practice_entry: Omit<GeneratedAddPracticeEntry, 'Returns'> & {
    Returns: CorrectedPracticeEntryReturns<
      GeneratedAddPracticeEntry['Returns']
    >;
  };
  add_practice_entry_core: Omit<GeneratedAddPracticeEntryCore, 'Returns'> & {
    Returns: CorrectedPracticeEntryReturns<
      GeneratedAddPracticeEntryCore['Returns']
    >;
  };
  add_practice_entry_for_user: Omit<
    GeneratedAddPracticeEntryForUser,
    'Returns'
  > & {
    Returns: CorrectedPracticeEntryReturns<
      GeneratedAddPracticeEntryForUser['Returns']
    >;
  };
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
  claim_due_practices: Omit<GeneratedClaimDuePractices, 'Returns'> & {
    Returns: Array<
      Omit<GeneratedClaimDuePractices['Returns'][number], 'source_title'> & {
        source_title: string | null;
      }
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
  consume_telegram_practice_reply: Omit<
    GeneratedConsumeTelegramPracticeReply,
    'Returns'
  > & {
    Returns: CorrectedPracticeEntryReturns<
      GeneratedConsumeTelegramPracticeReply['Returns']
    >;
  };
  match_notes: Omit<GeneratedMatchNotes, 'Returns'> & {
    Returns: MatchNoteRow[];
  };
  match_notes_for_user: Omit<GeneratedMatchNotesForUser, 'Returns'> & {
    Returns: MatchNoteRow[];
  };
  manage_practice: Omit<GeneratedManagePractice, 'Returns'> & {
    Returns: CorrectedPracticeReturns<GeneratedManagePractice['Returns']>;
  };
  manage_practice_core: Omit<GeneratedManagePracticeCore, 'Returns'> & {
    Returns: CorrectedPracticeReturns<GeneratedManagePracticeCore['Returns']>;
  };
  manage_practice_for_user: Omit<GeneratedManagePracticeForUser, 'Returns'> & {
    Returns: CorrectedPracticeReturns<
      GeneratedManagePracticeForUser['Returns']
    >;
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
