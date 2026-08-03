import { z } from 'zod';

import {
  CAPTURE_CHANNELS,
  DEFAULT_SEARCH_MATCH_COUNT,
  MAX_NOTE_TEXT_LENGTH,
  MAX_PERSONAL_CONTEXT_LENGTH,
  MAX_PRACTICE_ENTRY_TEXT_LENGTH,
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

export const classificationSchema = z
  .object({ noteType: noteTypeSchema })
  .strict();

export const captureNoteResponseSchema = z
  .object({
    note: z
      .object({
        id: z.string().uuid(),
        originalText: z.string().min(1),
        noteType: noteTypeSchema,
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

export const deleteAccountRequestSchema = z.object({}).strict();

export const deleteAccountResponseSchema = z
  .object({ deleted: z.literal(true) })
  .strict();

export const practiceStatusSchema = z.enum(['active', 'paused', 'integrated']);
export const practiceEntryKindSchema = z.enum(['reflection', 'story']);
export const practiceSourceChannelSchema = z.enum([
  'web',
  'telegram_text',
  'telegram_voice',
]);

const practiceNoteAction = <T extends string>(action: T) =>
  z.object({ action: z.literal(action), noteId: z.string().uuid() }).strict();

export const managePracticeRequestSchema = z.discriminatedUnion('action', [
  practiceNoteAction('activate'),
  practiceNoteAction('reread'),
  z
    .object({
      action: z.literal('setInterval'),
      noteId: z.string().uuid(),
      intervalDays: z.number().int().min(1).max(30),
    })
    .strict(),
  z
    .object({
      action: z.literal('pause'),
      noteId: z.string().uuid(),
      resumeOn: z.iso.date().optional(),
    })
    .strict(),
  practiceNoteAction('resume'),
  practiceNoteAction('integrate'),
  practiceNoteAction('confirmIntegrated'),
  practiceNoteAction('stopCheckIns'),
  z
    .object({
      action: z.literal('addEntry'),
      noteId: z.string().uuid(),
      entryKind: practiceEntryKindSchema,
      text: nonBlankString(MAX_PRACTICE_ENTRY_TEXT_LENGTH),
    })
    .strict(),
]);

export const practiceStateSchema = z
  .object({
    noteId: z.string().uuid(),
    status: practiceStatusSchema,
    intervalDays: z.number().int().min(1).max(30),
    nextDueOn: z.iso.date().nullable(),
    pausedUntil: z.iso.date().nullable(),
    readyToResume: z.boolean(),
    integratedAt: z.iso.datetime({ offset: true }).nullable(),
    checkInsEnabled: z.boolean(),
    nextCheckInOn: z.iso.date().nullable(),
    lastPractisedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const managePracticeResponseSchema = z
  .object({
    practice: practiceStateSchema,
    entry: z
      .object({
        id: z.string().uuid(),
        kind: practiceEntryKindSchema,
        text: z.string().min(1).max(MAX_PRACTICE_ENTRY_TEXT_LENGTH),
        sourceChannel: practiceSourceChannelSchema,
        createdAt: z.iso.datetime({ offset: true }),
      })
      .strict()
      .optional(),
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
export type Classification = z.infer<typeof classificationSchema>;
export type SearchNotesRequest = z.infer<typeof searchNotesRequestSchema>;
export type SearchNotesResponse = z.infer<typeof searchNotesResponseSchema>;
export type SearchMatch = z.infer<typeof searchMatchSchema>;
export type TelegramLinkCodeRequest = z.infer<
  typeof telegramLinkCodeRequestSchema
>;
export type TelegramLinkCodeResponse = z.infer<
  typeof telegramLinkCodeResponseSchema
>;
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;
export type DeleteAccountResponse = z.infer<typeof deleteAccountResponseSchema>;
export type ManagePracticeRequest = z.infer<typeof managePracticeRequestSchema>;
export type ManagePracticeResponse = z.infer<
  typeof managePracticeResponseSchema
>;
export type PracticeState = z.infer<typeof practiceStateSchema>;
export type DailyDigest = z.infer<typeof dailyDigestSchema>;
