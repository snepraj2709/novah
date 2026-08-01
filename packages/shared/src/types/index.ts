import type {
  CAPTURE_CHANNELS,
  NOTE_TYPES,
  REVIEW_STAGES,
  REVIEW_STATUSES,
} from '../constants/index.ts';

export type NoteType = (typeof NOTE_TYPES)[number];
export type CaptureChannel = (typeof CAPTURE_CHANNELS)[number];
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export type ReviewStage = (typeof REVIEW_STAGES)[number];
