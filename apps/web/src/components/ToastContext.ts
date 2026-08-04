import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error';

export interface ToastMessage {
  id: number;
  tone: ToastTone;
  message: string;
}

export interface ToastContextValue {
  dismissToast: () => void;
  showToast: (tone: ToastTone, message: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider.');
  }
  return context;
}
