import {
  captureNoteRequestSchema,
  type CaptureNoteRequest,
} from '@novah/shared/contracts';
import { NOTE_TYPES } from '@novah/shared/constants';
import type { NoteType } from '@novah/shared/types';

export type DraftStatus = 'draft' | 'failed';
export type DraftOrigin = 'manual' | 'selection';

export interface CaptureDraft {
  clientRequestId: string;
  originalText: string;
  personalContext: string;
  noteType: NoteType | '';
  sourceTitle: string;
  sourceUrl: string;
  sourceUnavailable: boolean;
  origin: DraftOrigin;
  status: DraftStatus;
  lastError?: string;
  updatedAt: string;
}

export interface DraftCollection {
  activeId: string | null;
  drafts: CaptureDraft[];
}

export interface SelectionCapture {
  selectionText: string;
  pageTitle?: string;
  pageUrl?: string;
}

export type DraftFieldErrors = Partial<
  Record<
    | 'originalText'
    | 'personalContext'
    | 'noteType'
    | 'sourceTitle'
    | 'sourceUrl',
    string
  >
>;

const MAX_SAVED_DRAFTS = 10;

export function isHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function createCaptureDraft(
  input: Partial<CaptureDraft> = {},
): CaptureDraft {
  return {
    clientRequestId: input.clientRequestId ?? crypto.randomUUID(),
    originalText: input.originalText ?? '',
    personalContext: input.personalContext ?? '',
    noteType: input.noteType ?? '',
    sourceTitle: input.sourceTitle ?? '',
    sourceUrl: input.sourceUrl ?? '',
    sourceUnavailable: input.sourceUnavailable ?? false,
    origin: input.origin ?? 'manual',
    status: input.status ?? 'draft',
    ...(input.lastError ? { lastError: input.lastError } : {}),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function draftFromSelection(
  selection: SelectionCapture,
  clientRequestId = crypto.randomUUID(),
): CaptureDraft {
  const pageUrl = selection.pageUrl?.trim() ?? '';
  const validSourceUrl = isHttpUrl(pageUrl) ? pageUrl : '';

  return createCaptureDraft({
    clientRequestId,
    originalText: selection.selectionText,
    sourceTitle: selection.pageTitle?.trim() ?? '',
    sourceUrl: validSourceUrl,
    sourceUnavailable: Boolean(pageUrl && !validSourceUrl),
    origin: 'selection',
  });
}

export function emptyDraftCollection(): DraftCollection {
  return { activeId: null, drafts: [] };
}

export function addDraft(
  collection: DraftCollection,
  draft: CaptureDraft,
): DraftCollection {
  const withoutDuplicate = collection.drafts.filter(
    (candidate) => candidate.clientRequestId !== draft.clientRequestId,
  );
  return {
    activeId: draft.clientRequestId,
    drafts: [draft, ...withoutDuplicate].slice(0, MAX_SAVED_DRAFTS),
  };
}

export function updateDraft(
  collection: DraftCollection,
  clientRequestId: string,
  patch: Partial<CaptureDraft>,
): DraftCollection {
  return {
    ...collection,
    drafts: collection.drafts.map((draft) =>
      draft.clientRequestId === clientRequestId
        ? {
            ...draft,
            ...patch,
            clientRequestId,
            status: patch.status ?? 'draft',
            updatedAt: new Date().toISOString(),
          }
        : draft,
    ),
  };
}

export function markDraftFailed(
  collection: DraftCollection,
  clientRequestId: string,
  message: string,
): DraftCollection {
  return updateDraft(collection, clientRequestId, {
    status: 'failed',
    lastError: message,
  });
}

export function removeDraft(
  collection: DraftCollection,
  clientRequestId: string,
): DraftCollection {
  const drafts = collection.drafts.filter(
    (draft) => draft.clientRequestId !== clientRequestId,
  );
  return {
    drafts,
    activeId:
      collection.activeId === clientRequestId
        ? (drafts[0]?.clientRequestId ?? null)
        : collection.activeId,
  };
}

export function activateDraft(
  collection: DraftCollection,
  clientRequestId: string,
): DraftCollection {
  return collection.drafts.some(
    (draft) => draft.clientRequestId === clientRequestId,
  )
    ? { ...collection, activeId: clientRequestId }
    : collection;
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function draftToCaptureRequest(draft: CaptureDraft): CaptureNoteRequest {
  const personalContext = optional(draft.personalContext);
  const sourceTitle = optional(draft.sourceTitle);
  const sourceUrl = optional(draft.sourceUrl);

  return {
    originalText: draft.originalText,
    ...(personalContext ? { personalContext } : {}),
    ...(draft.noteType ? { noteType: draft.noteType } : {}),
    ...(sourceTitle ? { sourceTitle } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    captureChannel: 'extension',
    clientRequestId: draft.clientRequestId,
  };
}

export function validateDraft(draft: CaptureDraft):
  | { success: true; request: CaptureNoteRequest }
  | {
      success: false;
      fieldErrors: DraftFieldErrors;
    } {
  const result = captureNoteRequestSchema.safeParse(
    draftToCaptureRequest(draft),
  );
  if (result.success) return { success: true, request: result.data };

  const fieldErrors: DraftFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (
      typeof field === 'string' &&
      field in draft &&
      !(field in fieldErrors)
    ) {
      fieldErrors[field as keyof DraftFieldErrors] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}

export function isCaptureDraft(value: unknown): value is CaptureDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<CaptureDraft>;
  return (
    typeof draft.clientRequestId === 'string' &&
    typeof draft.originalText === 'string' &&
    typeof draft.personalContext === 'string' &&
    (draft.noteType === '' ||
      NOTE_TYPES.includes(draft.noteType as (typeof NOTE_TYPES)[number])) &&
    typeof draft.sourceTitle === 'string' &&
    typeof draft.sourceUrl === 'string' &&
    typeof draft.sourceUnavailable === 'boolean' &&
    (draft.origin === 'manual' || draft.origin === 'selection') &&
    (draft.status === 'draft' || draft.status === 'failed') &&
    typeof draft.updatedAt === 'string'
  );
}
