import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  ToastContext,
  type ToastMessage,
  type ToastTone,
} from './ToastContext.ts';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const sequence = useRef(0);

  const dismissToast = useCallback(() => setToast(null), []);
  const showToast = useCallback((tone: ToastTone, message: string) => {
    setToast({ id: ++sequence.current, tone, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 4_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const value = useMemo(
    () => ({ dismissToast, showToast }),
    [dismissToast, showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          key={toast.id}
          className={`action-toast ${toast.tone}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
