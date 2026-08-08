import { isCaptureDraft, type CaptureDraft } from './draft-model.ts';

export const SHORTCUT_CAPTURE_STORAGE_KEY = 'novah-shortcut-capture-queue';
export const RESUME_SHORTCUT_CAPTURES_MESSAGE = 'resume-shortcut-captures';
export const SAVE_SELECTION_COMMAND = 'save-selection-to-novah';
export const SHORTCUT_NOTICE_DISMISSED_KEY = 'novah-shortcut-notice-dismissed';

export interface ShortcutCaptureIntent {
  draft: CaptureDraft;
  tabId: number;
  windowId: number;
  createdAt: string;
}

export interface ResumeShortcutCapturesMessage {
  type: typeof RESUME_SHORTCUT_CAPTURES_MESSAGE;
}

export interface ShortcutCaptureProcessResult {
  status: 'empty' | 'saved' | 'needs-auth' | 'failed';
  saved: ShortcutCaptureIntent[];
  remaining: ShortcutCaptureIntent[];
  failed?: ShortcutCaptureIntent;
  error?: unknown;
}

interface BrowserCommand {
  name?: string;
  shortcut?: string;
}

export function isSaveSelectionShortcutUnassigned(
  commands: BrowserCommand[],
): boolean {
  const command = commands.find(
    (candidate) => candidate.name === SAVE_SELECTION_COMMAND,
  );
  return Boolean(command && !command.shortcut);
}

export async function shouldShowShortcutNotice(): Promise<boolean> {
  try {
    const [commands, stored] = await Promise.all([
      browser.commands.getAll(),
      browser.storage.local.get(SHORTCUT_NOTICE_DISMISSED_KEY),
    ]);
    return (
      stored[SHORTCUT_NOTICE_DISMISSED_KEY] !== true &&
      isSaveSelectionShortcutUnassigned(commands)
    );
  } catch {
    return false;
  }
}

export async function dismissShortcutNotice(): Promise<void> {
  await browser.storage.local.set({
    [SHORTCUT_NOTICE_DISMISSED_KEY]: true,
  });
}

export function isResumeShortcutCapturesMessage(
  value: unknown,
): value is ResumeShortcutCapturesMessage {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as Partial<ResumeShortcutCapturesMessage>).type ===
      RESUME_SHORTCUT_CAPTURES_MESSAGE
  );
}

export function isShortcutCaptureIntent(
  value: unknown,
): value is ShortcutCaptureIntent {
  if (!value || typeof value !== 'object') return false;
  const intent = value as Partial<ShortcutCaptureIntent>;
  return (
    isCaptureDraft(intent.draft) &&
    intent.draft.origin === 'selection' &&
    Number.isInteger(intent.tabId) &&
    (intent.tabId ?? -1) >= 0 &&
    Number.isInteger(intent.windowId) &&
    (intent.windowId ?? -1) >= 0 &&
    typeof intent.createdAt === 'string' &&
    Number.isFinite(Date.parse(intent.createdAt))
  );
}

export function parseShortcutCaptureQueue(
  value: unknown,
): ShortcutCaptureIntent[] {
  return Array.isArray(value) ? value.filter(isShortcutCaptureIntent) : [];
}

export function appendShortcutCaptureIntent(
  queue: ShortcutCaptureIntent[],
  intent: ShortcutCaptureIntent,
): ShortcutCaptureIntent[] {
  return queue.some(
    (candidate) =>
      candidate.draft.clientRequestId === intent.draft.clientRequestId,
  )
    ? queue
    : [...queue, intent];
}

export async function loadShortcutCaptureQueue(): Promise<
  ShortcutCaptureIntent[]
> {
  const stored = await browser.storage.local.get(SHORTCUT_CAPTURE_STORAGE_KEY);
  return parseShortcutCaptureQueue(stored[SHORTCUT_CAPTURE_STORAGE_KEY]);
}

export async function saveShortcutCaptureQueue(
  queue: ShortcutCaptureIntent[],
): Promise<void> {
  await browser.storage.local.set({
    [SHORTCUT_CAPTURE_STORAGE_KEY]: queue,
  });
}

export async function enqueueShortcutCapture(
  intent: ShortcutCaptureIntent,
): Promise<void> {
  const queue = await loadShortcutCaptureQueue();
  await saveShortcutCaptureQueue(appendShortcutCaptureIntent(queue, intent));
}

export function subscribeToShortcutCaptureQueue(
  callback: (queue: ShortcutCaptureIntent[]) => void,
): () => void {
  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !changes[SHORTCUT_CAPTURE_STORAGE_KEY]) {
      return;
    }
    callback(
      parseShortcutCaptureQueue(changes[SHORTCUT_CAPTURE_STORAGE_KEY].newValue),
    );
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export async function processShortcutCaptureIntents(
  queue: ShortcutCaptureIntent[],
  capture: (intent: ShortcutCaptureIntent) => Promise<void>,
  isUnauthorized: (error: unknown) => boolean,
): Promise<ShortcutCaptureProcessResult> {
  if (queue.length === 0) {
    return { status: 'empty', saved: [], remaining: [] };
  }

  const saved: ShortcutCaptureIntent[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const intent = queue[index];
    if (!intent) continue;
    try {
      await capture(intent);
      saved.push(intent);
    } catch (error) {
      if (isUnauthorized(error)) {
        return {
          status: 'needs-auth',
          saved,
          remaining: queue.slice(index),
          error,
        };
      }
      return {
        status: 'failed',
        saved,
        failed: intent,
        remaining: queue.slice(index + 1),
        error,
      };
    }
  }

  return { status: 'saved', saved, remaining: [] };
}
