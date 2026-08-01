import {
  emptyDraftCollection,
  isCaptureDraft,
  type DraftCollection,
} from './draft-model.ts';

export const DRAFT_STORAGE_KEY = 'novah-capture-drafts';

export function parseDraftCollection(value: unknown): DraftCollection {
  if (!value || typeof value !== 'object') return emptyDraftCollection();
  const candidate = value as Partial<DraftCollection>;
  const drafts = Array.isArray(candidate.drafts)
    ? candidate.drafts.filter(isCaptureDraft)
    : [];
  const activeId =
    typeof candidate.activeId === 'string' &&
    drafts.some((draft) => draft.clientRequestId === candidate.activeId)
      ? candidate.activeId
      : (drafts[0]?.clientRequestId ?? null);
  return { activeId, drafts };
}

export async function loadDraftCollection(): Promise<DraftCollection> {
  const stored = await browser.storage.local.get(DRAFT_STORAGE_KEY);
  return parseDraftCollection(stored[DRAFT_STORAGE_KEY]);
}

export async function saveDraftCollection(
  collection: DraftCollection,
): Promise<void> {
  await browser.storage.local.set({ [DRAFT_STORAGE_KEY]: collection });
}

export function subscribeToDraftCollection(
  callback: (collection: DraftCollection) => void,
): () => void {
  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !changes[DRAFT_STORAGE_KEY]) return;
    callback(parseDraftCollection(changes[DRAFT_STORAGE_KEY].newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
