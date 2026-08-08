export type PageToastKind = 'success' | 'error';

declare const chrome: {
  runtime: {
    onMessage: {
      addListener(listener: (message: unknown) => void): void;
    };
  };
};

const PAGE_TOAST_DURATION_MS = 2_600;
const PAGE_TOAST_MESSAGE_TYPE = 'novah-page-toast';

interface PageToastMessage {
  type: typeof PAGE_TOAST_MESSAGE_TYPE;
  message: string;
  kind: PageToastKind;
}

function installNovahPageToastBridge(
  initialMessage: string | null,
  initialKind: PageToastKind,
  durationMs: number,
): void {
  const bridgeGlobal = globalThis as typeof globalThis & {
    __novahPageToastBridgeInstalled?: boolean;
  };

  const render = (message: string, kind: PageToastKind): void => {
    const existing = document.querySelector('[data-novah-page-toast]');
    existing?.remove();

    const host = document.createElement('div');
    host.dataset.novahPageToast = 'true';
    host.style.position = 'fixed';
    host.style.top = '24px';
    host.style.right = '24px';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';

    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .toast {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        width: min(340px, calc(100vw - 48px));
        min-height: 72px;
        overflow: hidden;
        border: 1px solid rgba(24, 37, 31, 0.14);
        border-radius: 12px;
        color: #18251f;
        background: #fffefb;
        padding: 14px 18px;
        box-sizing: border-box;
        box-shadow: 0 18px 48px rgba(24, 37, 31, 0.22);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system,
          BlinkMacSystemFont, "Segoe UI", sans-serif;
        animation: novah-toast-in 180ms ease-out both;
      }
      .icon {
        display: grid;
        flex: 0 0 36px;
        width: 36px;
        height: 36px;
        place-items: center;
        border-radius: 50%;
        color: white;
        background: #2f6f55;
        font-size: 20px;
        font-weight: 800;
      }
      .error .icon { background: #b42318; }
      .message {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        line-height: 1.3;
      }
      .progress {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 3px;
        background: #2f6f55;
        transform-origin: left;
        animation: novah-toast-progress ${durationMs}ms linear forwards;
      }
      .error .progress { background: #b42318; }
      @keyframes novah-toast-in {
        from { opacity: 0; transform: translateY(-10px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes novah-toast-progress {
        from { transform: scaleX(1); }
        to { transform: scaleX(0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .toast { animation: none; }
      }
    `;

    const toast = document.createElement('aside');
    toast.className = `toast ${kind}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = kind === 'success' ? '✓' : '!';

    const text = document.createElement('p');
    text.className = 'message';
    text.textContent = message;

    const progress = document.createElement('span');
    progress.className = 'progress';
    progress.setAttribute('aria-hidden', 'true');

    toast.append(icon, text, progress);
    shadow.append(style, toast);
    (document.body ?? document.documentElement).append(host);

    window.setTimeout(() => host.remove(), durationMs);
  };

  if (!bridgeGlobal.__novahPageToastBridgeInstalled) {
    chrome.runtime.onMessage.addListener((value: unknown) => {
      if (!value || typeof value !== 'object') return;
      const message = value as Partial<PageToastMessage>;
      if (
        message.type !== PAGE_TOAST_MESSAGE_TYPE ||
        typeof message.message !== 'string' ||
        (message.kind !== 'success' && message.kind !== 'error')
      ) {
        return;
      }
      render(message.message, message.kind);
    });
    bridgeGlobal.__novahPageToastBridgeInstalled = true;
  }

  if (initialMessage) render(initialMessage, initialKind);
}

export async function preparePageToastBridge(tabId: number): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId },
    func: installNovahPageToastBridge,
    args: [null, 'success', PAGE_TOAST_DURATION_MS],
  });
}

export async function showPageToast(
  tabId: number,
  message: string,
  kind: PageToastKind,
): Promise<void> {
  const payload: PageToastMessage = {
    type: PAGE_TOAST_MESSAGE_TYPE,
    message,
    kind,
  };
  try {
    await browser.tabs.sendMessage(tabId, payload);
  } catch {
    await browser.scripting.executeScript({
      target: { tabId },
      func: installNovahPageToastBridge,
      args: [message, kind, PAGE_TOAST_DURATION_MS],
    });
  }
}
