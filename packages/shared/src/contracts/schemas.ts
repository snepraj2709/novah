import { z } from 'zod';

import {
  CAPTURE_CHANNELS,
  MAX_SEARCH_MATCH_COUNT,
  NOTE_TYPES,
  REVIEW_STATUSES,
} from '../constants/index.ts';

export const noteTypeSchema = z.enum(NOTE_TYPES);
export const captureChannelSchema = z.enum(CAPTURE_CHANNELS);
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);

// Placeholder request contracts. Phase 2.1 finalizes all API validation rules.
export const captureNoteRequestSchema = z.object({
  originalText: z.string().min(1),
  personalContext: z.string().max(2_000).optional(),
  noteType: noteTypeSchema.optional(),
  sourceTitle: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  captureChannel: captureChannelSchema,
  clientRequestId: z.string().uuid(),
});

export const searchNotesRequestSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(MAX_SEARCH_MATCH_COUNT).default(8),
});

export type CaptureNoteRequest = z.infer<typeof captureNoteRequestSchema>;
export type SearchNotesRequest = z.infer<typeof searchNotesRequestSchema>;
