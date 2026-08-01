export const NOTE_TYPES = [
  'quote',
  'argument',
  'lesson',
  'observation',
  'reflection',
  'principle',
  'conversation_note',
] as const;

export const CAPTURE_CHANNELS = [
  'extension',
  'web',
  'telegram_text',
  'telegram_voice',
] as const;

export const REVIEW_STATUSES = [
  'pending',
  'sent',
  'remembered',
  'partial',
  'missed',
  'skipped',
] as const;

export const REVIEW_STAGES = [1, 2, 3, 4, 5] as const;
export const REVIEW_STAGE_DAY_OFFSETS = [1, 2, 3, 7, 21] as const;

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_DIGEST_TIME = '21:00';
export const DEFAULT_REVIEW_TIME = '09:00';

export const MAX_SEARCH_MATCH_COUNT = 20;
export const DEFAULT_SEARCH_MATCH_COUNT = 8;
export const MIN_SYNTHESIS_SIMILARITY = 0.55;

export const MAX_NOTE_TEXT_LENGTH = 20_000;
export const MAX_PERSONAL_CONTEXT_LENGTH = 2_000;
export const MAX_SOURCE_TITLE_LENGTH = 500;
export const MAX_SOURCE_URL_LENGTH = 2_048;
export const MAX_SEARCH_QUERY_LENGTH = 500;

export const OPENAI_TEXT_MODEL = 'gpt-5.6-luna';
export const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
export const OPENAI_EMBEDDING_DIMENSIONS = 1_536;
