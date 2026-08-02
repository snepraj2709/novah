import { z } from 'zod';

import {
  CAPTURE_CHANNELS,
  DEFAULT_SEARCH_MATCH_COUNT,
  MAX_NOTE_TEXT_LENGTH,
  MAX_PERSONAL_CONTEXT_LENGTH,
  MAX_SEARCH_MATCH_COUNT,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SOURCE_TITLE_LENGTH,
  MAX_SOURCE_URL_LENGTH,
  NOTE_TYPES,
  REVIEW_STATUSES,
  TELEGRAM_LINK_CODE_LENGTH,
} from '../constants/index.ts';

export const noteTypeSchema = z.enum(NOTE_TYPES);
export const captureChannelSchema = z.enum(CAPTURE_CHANNELS);
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);

const nonBlankString = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine((value) => /\S/u.test(value), 'Must contain non-whitespace text');

export const httpUrlSchema = z
  .string()
  .max(MAX_SOURCE_URL_LENGTH)
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  }, 'Must use http or https');

export const captureNoteRequestSchema = z
  .object({
    originalText: nonBlankString(MAX_NOTE_TEXT_LENGTH),
    personalContext: nonBlankString(MAX_PERSONAL_CONTEXT_LENGTH).optional(),
    noteType: noteTypeSchema.optional(),
    sourceTitle: nonBlankString(MAX_SOURCE_TITLE_LENGTH).optional(),
    sourceUrl: httpUrlSchema.optional(),
    captureChannel: captureChannelSchema,
    clientRequestId: z.string().uuid(),
  })
  .strict();

export const enrichmentSchema = z
  .object({
    noteType: noteTypeSchema,
    summary: nonBlankString(500),
    tags: z
      .array(
        z
          .string()
          .regex(
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
            'Tags must be lowercase words joined with hyphens',
          ),
      )
      .min(2)
      .max(5)
      .refine(
        (tags) => new Set(tags).size === tags.length,
        'Tags must be unique',
      ),
    recallPrompt: nonBlankString(500),
  })
  .strict();

export const captureNoteResponseSchema = z
  .object({
    note: z
      .object({
        id: z.string().uuid(),
        originalText: z.string().min(1),
        noteType: noteTypeSchema,
        summary: z.string().min(1).max(500),
        tags: z.array(z.string()).max(5),
        firstReviewDate: z.iso.date(),
      })
      .strict(),
  })
  .strict();

export const searchNotesRequestSchema = z
  .object({
    query: nonBlankString(MAX_SEARCH_QUERY_LENGTH),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_SEARCH_MATCH_COUNT)
      .default(DEFAULT_SEARCH_MATCH_COUNT),
  })
  .strict();

export const searchMatchSchema = z
  .object({
    noteId: z.string().uuid(),
    originalText: z.string(),
    personalContext: z.string().nullable(),
    noteType: noteTypeSchema,
    summary: z.string(),
    tags: z.array(z.string()),
    recallPrompt: z.string(),
    sourceTitle: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    capturedAt: z.iso.datetime({ offset: true }),
    similarity: z.number().min(-1).max(1),
  })
  .strict();

export const searchCitationSchema = z
  .object({
    number: z.number().int().positive(),
    noteId: z.string().uuid(),
  })
  .strict();

export const searchNotesResponseSchema = z
  .object({
    answer: z.string().min(1).nullable(),
    citations: z.array(searchCitationSchema),
    matches: z.array(searchMatchSchema).max(MAX_SEARCH_MATCH_COUNT),
    synthesisWithheld: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.synthesisWithheld && value.answer !== null) {
      context.addIssue({
        code: 'custom',
        path: ['answer'],
        message: 'Withheld synthesis must have a null answer',
      });
    }

    if (value.synthesisWithheld && value.citations.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['citations'],
        message: 'Withheld synthesis cannot include citations',
      });
    }

    if (!value.synthesisWithheld && value.citations.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['citations'],
        message: 'A synthesis must include at least one citation',
      });
    }
  });

export const telegramLinkCodeRequestSchema = z.object({}).strict();

export const telegramLinkCodeResponseSchema = z
  .object({
    code: z
      .string()
      .length(TELEGRAM_LINK_CODE_LENGTH)
      .regex(/^[A-HJ-NP-Z2-9]+$/u),
    expiresAt: z.iso.datetime({ offset: true }),
    connected: z.boolean(),
  })
  .strict();

export const digestThemeSchema = z
  .object({
    title: nonBlankString(200),
    noteIds: z
      .array(z.string().uuid())
      .min(2)
      .refine((noteIds) => new Set(noteIds).size === noteIds.length),
  })
  .strict();

export const dailyDigestSchema = z
  .object({
    captureCount: z.number().int().positive(),
    sourceCount: z.number().int().nonnegative(),
    themes: z.array(digestThemeSchema).max(3),
    connection: z
      .object({
        text: nonBlankString(500),
        noteIds: z
          .array(z.string().uuid())
          .min(2)
          .refine((noteIds) => new Set(noteIds).size === noteIds.length),
      })
      .strict()
      .nullable(),
    reflectionQuestion: nonBlankString(500),
  })
  .strict();

export type CaptureNoteRequest = z.infer<typeof captureNoteRequestSchema>;
export type CaptureNoteResponse = z.infer<typeof captureNoteResponseSchema>;
export type Enrichment = z.infer<typeof enrichmentSchema>;
export type SearchNotesRequest = z.infer<typeof searchNotesRequestSchema>;
export type SearchNotesResponse = z.infer<typeof searchNotesResponseSchema>;
export type SearchMatch = z.infer<typeof searchMatchSchema>;
export type TelegramLinkCodeRequest = z.infer<
  typeof telegramLinkCodeRequestSchema
>;
export type TelegramLinkCodeResponse = z.infer<
  typeof telegramLinkCodeResponseSchema
>;
export type DailyDigest = z.infer<typeof dailyDigestSchema>;
