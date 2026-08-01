import { addDraft, draftFromSelection } from '../lib/draft-model.ts';
import {
  loadDraftCollection,
  saveDraftCollection,
} from '../lib/draft-storage.ts';

const SAVE_SELECTION_MENU_ID = 'save-to-novah';

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
});
