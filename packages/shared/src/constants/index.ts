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

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_PRACTICE_TIME = '09:00';
export const DEFAULT_PRACTICE_INTERVAL_DAYS = 1;
export const MAX_ACTIVE_PRACTICES = 3;

export const MAX_SEARCH_MATCH_COUNT = 20;
export const DEFAULT_SEARCH_MATCH_COUNT = 8;
export const MIN_SYNTHESIS_SIMILARITY = 0.55;

export const MAX_NOTE_TEXT_LENGTH = 20_000;
export const MAX_PERSONAL_CONTEXT_LENGTH = 2_000;
export const MAX_SOURCE_TITLE_LENGTH = 500;
export const MAX_SOURCE_URL_LENGTH = 2_048;
export const MAX_SEARCH_QUERY_LENGTH = 500;
export const MAX_PRACTICE_ENTRY_TEXT_LENGTH = 5_000;
export const MAX_JSON_REQUEST_BYTES = 64 * 1024;
export const MAX_TELEGRAM_UPDATE_BYTES = 256 * 1024;

export const TELEGRAM_LINK_CODE_LENGTH = 12;
export const TELEGRAM_LINK_CODE_TTL_MINUTES = 10;
export const MAX_TELEGRAM_VOICE_DURATION_SECONDS = 120;
export const MAX_TELEGRAM_VOICE_BYTES = 10 * 1024 * 1024;
export const MAX_TELEGRAM_MESSAGE_LENGTH = 4_096;

export const OPENAI_TEXT_MODEL = 'gpt-5.6-luna';
export const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
export const OPENAI_EMBEDDING_DIMENSIONS = 1_536;
export const OPENAI_TRANSCRIPTION_MODEL = 'gpt-transcribe';
