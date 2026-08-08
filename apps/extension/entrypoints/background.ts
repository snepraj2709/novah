import { captureNote, ExtensionApiError } from '../lib/api.ts';
import {
  addDraft,
  draftFromSelection,
  draftToCaptureRequest,
  markDraftFailed,
} from '../lib/draft-model.ts';
import {
  DRAFT_STORAGE_KEY,
  loadDraftCollection,
  saveDraftCollection,
} from '../lib/draft-storage.ts';
import { preparePageToastBridge, showPageToast } from '../lib/page-toast.ts';
import {
  appendShortcutCaptureIntent,
  isResumeShortcutCapturesMessage,
  loadShortcutCaptureQueue,
  processShortcutCaptureIntents,
  SAVE_SELECTION_COMMAND,
  saveShortcutCaptureQueue,
  SHORTCUT_CAPTURE_STORAGE_KEY,
  type ShortcutCaptureIntent,
} from '../lib/shortcut-capture.ts';
import { supabase } from '../lib/supabase.ts';

const SAVE_SELECTION_MENU_ID = 'save-to-novah';
const DEFAULT_ACTION_TITLE = 'Open Novah';
const BADGE_DURATION_MS = 2_000;

const badgeTimers = new Map<number | 'global', ReturnType<typeof setTimeout>>();
let shortcutWork: Promise<void> = Promise.resolve();
let queueStorageWork: Promise<void> = Promise.resolve();

function runShortcutWork<T>(work: () => Promise<T>): Promise<T> {
  const result = shortcutWork.then(work, work);
  shortcutWork = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function runQueueStorageWork<T>(work: () => Promise<T>): Promise<T> {
  const result = queueStorageWork.then(work, work);
  queueStorageWork = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function showBadge(
  tabId: number | undefined,
  text: '✓' | '!',
  color: string,
  title: string,
): Promise<void> {
  const key = tabId ?? 'global';
  const previousTimer = badgeTimers.get(key);
  if (previousTimer) clearTimeout(previousTimer);

  const target = tabId === undefined ? {} : { tabId };
  await Promise.allSettled([
    browser.action.setBadgeText({ ...target, text }),
    browser.action.setBadgeBackgroundColor({ ...target, color }),
    browser.action.setTitle({ ...target, title }),
  ]);

  const timer = setTimeout(() => {
    badgeTimers.delete(key);
    void Promise.allSettled([
      browser.action.setBadgeText({ ...target, text: '' }),
      browser.action.setTitle({ ...target, title: DEFAULT_ACTION_TITLE }),
    ]);
  }, BADGE_DURATION_MS);
  badgeTimers.set(key, timer);
}

function showSuccessBadge(tabId: number): Promise<void> {
  return showBadge(tabId, '✓', '#2f6f55', 'Saved to Novah');
}

async function showSuccessFeedback(tabId: number): Promise<void> {
  await Promise.allSettled([
    showSuccessBadge(tabId),
    showPageToast(tabId, 'Saved to Novah', 'success'),
  ]);
}

function showErrorBadge(
  tabId: number | undefined,
  title: string,
): Promise<void> {
  return showBadge(tabId, '!', '#b42318', title);
}

async function showErrorFeedback(
  tabId: number,
  message: string,
): Promise<void> {
  await Promise.allSettled([
    showErrorBadge(tabId, message),
    showPageToast(tabId, message, 'error'),
  ]);
}

function readSelectedText(): string {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement
  ) {
    const start = activeElement.selectionStart;
    const end = activeElement.selectionEnd;
    if (start !== null && end !== null && start !== end) {
      return activeElement.value.slice(
        Math.min(start, end),
        Math.max(start, end),
      );
    }
  }
  return window.getSelection()?.toString() ?? '';
}

async function extractSelection(tabId: number): Promise<string> {
  const [injection] = await browser.scripting.executeScript({
    target: { tabId },
    func: readSelectedText,
  });
  return typeof injection?.result === 'string' ? injection.result : '';
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ExtensionApiError && error.code === 'unauthorized';
}

async function openPanel(
  intent: ShortcutCaptureIntent,
  rejectedTitle: string,
): Promise<boolean> {
  try {
    await browser.sidePanel.open({ tabId: intent.tabId });
    return true;
  } catch {
    await showErrorBadge(intent.tabId, rejectedTitle);
    return false;
  }
}

async function persistFailedDraft(
  intent: ShortcutCaptureIntent,
  saved: ShortcutCaptureIntent[],
  message: string,
): Promise<void> {
  await runQueueStorageWork(async () => {
    const [collection, currentQueue] = await Promise.all([
      loadDraftCollection(),
      loadShortcutCaptureQueue(),
    ]);
    const completedIds = new Set([
      ...saved.map((item) => item.draft.clientRequestId),
      intent.draft.clientRequestId,
    ]);
    const remaining = currentQueue.filter(
      (item) => !completedIds.has(item.draft.clientRequestId),
    );
    const failedCollection = markDraftFailed(
      addDraft(collection, intent.draft),
      intent.draft.clientRequestId,
      message,
    );
    await browser.storage.local.set({
      [DRAFT_STORAGE_KEY]: failedCollection,
      [SHORTCUT_CAPTURE_STORAGE_KEY]: remaining,
    });
  });
}

async function enqueueDurably(intent: ShortcutCaptureIntent): Promise<void> {
  await runQueueStorageWork(async () => {
    const queue = await loadShortcutCaptureQueue();
    await saveShortcutCaptureQueue(appendShortcutCaptureIntent(queue, intent));
  });
}

async function removeSavedIntents(
  saved: ShortcutCaptureIntent[],
): Promise<ShortcutCaptureIntent[]> {
  if (saved.length === 0) return loadShortcutCaptureQueue();
  return runQueueStorageWork(async () => {
    const currentQueue = await loadShortcutCaptureQueue();
    const savedIds = new Set(saved.map((item) => item.draft.clientRequestId));
    const remaining = currentQueue.filter(
      (item) => !savedIds.has(item.draft.clientRequestId),
    );
    await saveShortcutCaptureQueue(remaining);
    return remaining;
  });
}

interface ProcessPendingOptions {
  closePanelAfterSuccess: boolean;
}

interface ProcessPendingOutcome {
  status: 'empty' | 'saved' | 'needs-auth' | 'failed';
  pendingAuthIntent?: ShortcutCaptureIntent;
}

async function processPendingShortcutCaptures({
  closePanelAfterSuccess,
}: ProcessPendingOptions): Promise<ProcessPendingOutcome> {
  const savedAcrossPasses: ShortcutCaptureIntent[] = [];

  while (true) {
    const queue = await runQueueStorageWork(loadShortcutCaptureQueue);
    const result = await processShortcutCaptureIntents(
      queue,
      async (intent) => {
        await captureNote(draftToCaptureRequest(intent.draft));
      },
      isUnauthorized,
    );

    if (result.status === 'failed' && result.failed) {
      const message = errorMessage(
        result.error,
        'Capture failed. Your draft is safe.',
      );
      await persistFailedDraft(result.failed, result.saved, message);
      await Promise.allSettled(
        result.saved.map((item) => showSuccessFeedback(item.tabId)),
      );
      await showErrorFeedback(result.failed.tabId, message);
      await openPanel(
        result.failed,
        'Save failed. Click Novah to retry your safe draft.',
      );
      return { status: 'failed' };
    }

    const remaining = await removeSavedIntents(result.saved);
    savedAcrossPasses.push(...result.saved);
    await Promise.allSettled(
      result.saved.map((item) => showSuccessFeedback(item.tabId)),
    );

    if (result.status === 'needs-auth') {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {
        // The queued capture remains safe even if local session cleanup fails.
      });
      return {
        status: 'needs-auth',
        pendingAuthIntent: remaining[0] ?? result.remaining[0],
      };
    }

    if (remaining.length > 0) continue;

    if (closePanelAfterSuccess && savedAcrossPasses.length > 0) {
      const windowIds = new Set(
        savedAcrossPasses.map((intent) => intent.windowId),
      );
      await Promise.allSettled(
        [...windowIds].map((windowId) => browser.sidePanel.close({ windowId })),
      );
    }

    return {
      status: savedAcrossPasses.length > 0 ? 'saved' : result.status,
    };
  }
}

interface CommandTab {
  id?: number;
  windowId?: number;
  title?: string;
  url?: string;
}

async function captureSelectionFromCommand(tab: CommandTab): Promise<void> {
  if (tab.id === undefined || tab.windowId === undefined) {
    await showErrorBadge(undefined, 'Novah could not access the active tab.');
    return;
  }

  let selectionText: string;
  try {
    selectionText = await extractSelection(tab.id);
  } catch {
    await showErrorBadge(
      tab.id,
      'This page blocks shortcut capture. Use Save to Novah from the right-click menu.',
    );
    return;
  }

  if (!selectionText.trim()) {
    await showErrorFeedback(tab.id, 'Select some text before saving to Novah.');
    return;
  }

  await preparePageToastBridge(tab.id).catch(() => {
    // Saving still succeeds if this page stops accepting injected feedback.
  });

  const intent: ShortcutCaptureIntent = {
    draft: draftFromSelection({
      selectionText,
      pageTitle: tab.title,
      pageUrl: tab.url,
    }),
    tabId: tab.id,
    windowId: tab.windowId,
    createdAt: new Date().toISOString(),
  };
  await enqueueDurably(intent);

  const outcome = await runShortcutWork(() =>
    processPendingShortcutCaptures({
      closePanelAfterSuccess: false,
    }),
  );
  if (outcome.status === 'needs-auth' && outcome.pendingAuthIntent) {
    await openPanel(
      outcome.pendingAuthIntent,
      'Sign in to Novah. Your selected text is safe.',
    );
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus
      .removeAll()
      .then(() => {
        browser.contextMenus.create({
          id: SAVE_SELECTION_MENU_ID,
          title: 'Save to Novah',
          contexts: ['selection'],
        });
      })
      .catch(() => {
        // Chrome will retry registration on the next extension update.
      });
  });

  void browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      // The context-menu action can still open the panel directly.
    });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (
      info.menuItemId !== SAVE_SELECTION_MENU_ID ||
      !info.selectionText?.trim()
    ) {
      return;
    }

    const persistSelection = async () => {
      const collection = await loadDraftCollection();
      const draft = draftFromSelection({
        selectionText: info.selectionText ?? '',
        pageTitle: tab?.title,
        pageUrl: info.pageUrl ?? tab?.url,
      });
      await saveDraftCollection(addDraft(collection, draft));
    };

    const operations: Promise<unknown>[] = [persistSelection()];
    if (tab?.id !== undefined) {
      operations.push(browser.sidePanel.open({ tabId: tab.id }));
    }
    void Promise.allSettled(operations);
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== SAVE_SELECTION_COMMAND) return;
    void captureSelectionFromCommand(tab ?? {}).catch(() =>
      tab?.id === undefined
        ? showErrorBadge(
            undefined,
            'Novah could not save this selection. Please try again.',
          )
        : showErrorFeedback(
            tab.id,
            'Novah could not save this selection. Please try again.',
          ),
    );
  });

  browser.runtime.onMessage.addListener((message) => {
    if (!isResumeShortcutCapturesMessage(message)) return undefined;
    return runShortcutWork(() =>
      processPendingShortcutCaptures({ closePanelAfterSuccess: true }),
    );
  });

  browser.runtime.onStartup.addListener(() => {
    void runShortcutWork(() =>
      processPendingShortcutCaptures({ closePanelAfterSuccess: false }),
    );
  });
});
