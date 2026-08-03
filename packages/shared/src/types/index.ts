import type { CAPTURE_CHANNELS, NOTE_TYPES } from '../constants/index.ts';

export * from './database.ts';

export type NoteType = (typeof NOTE_TYPES)[number];
export type CaptureChannel = (typeof CAPTURE_CHANNELS)[number];
