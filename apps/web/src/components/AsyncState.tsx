export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state-card" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="state-card error-state" role="alert">
      <span className="state-icon" aria-hidden="true">
        !
      </span>
      <div>
        <h2>Something went wrong</h2>
        <p>{message}</p>
      </div>
      {retry && (
        <button type="button" className="button secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-card empty-state">
      <span className="state-icon" aria-hidden="true">
        ○
      </span>
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
      {action}
    </div>
  );
}
import type { ReactNode } from 'react';
