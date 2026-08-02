import { useEffect, useRef } from 'react';

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy = false,
  destructive = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => cancelRef.current?.focus(), []);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Please confirm</p>
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <div className="button-row end">
          <button
            ref={cancelRef}
            type="button"
            className="button ghost"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`button ${destructive ? 'danger' : 'primary'}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
