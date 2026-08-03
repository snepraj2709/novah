import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import type { DashboardNote } from '../lib/dashboard.ts';
import { formatDateTime } from '../lib/time.ts';

function noteTypeLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

const CAPTURE_CHANNEL_LABELS: Record<
  NonNullable<DashboardNote['captureChannel']>,
  string
> = {
  extension: 'Extension',
  web: 'Web',
  telegram_text: 'Telegram text',
  telegram_voice: 'Telegram voice',
};

export function NoteDetailDrawer({
  note,
  onClose,
}: {
  note: DashboardNote;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const hasPersonalContext = Boolean(note.personalContext?.trim());
  const sourceTitle = note.sourceTitle?.trim() || null;
  const sourceUrl = note.sourceUrl?.trim() || null;

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;

    if (!dialog) return;

    dialog.showModal();
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      opener?.focus();
    };
  }, []);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const insideDrawer =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom;

    if (!insideDrawer) onClose();
  }

  function keepFocusInDrawer(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;

    const dialog = event.currentTarget;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    const active = document.activeElement;

    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    if (active === dialog || !dialog.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="note-detail-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={keepFocusInDrawer}
      onClick={handleBackdropClick}
    >
      <div className="note-detail-scroll">
        <header className="note-detail-header">
          <div>
            <span className="type-pill">{noteTypeLabel(note.noteType)}</span>
            <h2 id={titleId}>Note details</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="note-detail-close"
            aria-label="Close note details"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
            <span>Close</span>
          </button>
        </header>

        <div className="note-detail-content">
          <section aria-labelledby={`${titleId}-practice`}>
            <h3 id={`${titleId}-practice`}>Practice</h3>
            {note.practice ? (
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>
                    {note.practice.status === 'active'
                      ? 'Practising'
                      : note.practice.status}
                  </dd>
                </div>
                <div>
                  <dt>Interval</dt>
                  <dd>{note.practice.intervalDays} day</dd>
                </div>
                {note.practice.nextDueOn && (
                  <div>
                    <dt>Next due</dt>
                    <dd>{note.practice.nextDueOn}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p>
                Saved only. Choose Keep this with me from Collection to begin.
              </p>
            )}
          </section>

          <section aria-labelledby={`${titleId}-full-note`}>
            <h3 className="eyebrow" id={`${titleId}-full-note`}>
              Full note
            </h3>
            <p className="note-detail-original">{note.originalText}</p>
          </section>

          {hasPersonalContext && (
            <section
              className="note-detail-context"
              aria-labelledby={`${titleId}-context`}
            >
              <h3 id={`${titleId}-context`}>Why it mattered</h3>
              <p>{note.personalContext}</p>
            </section>
          )}

          <section
            className="note-detail-provenance"
            aria-labelledby={`${titleId}-provenance`}
          >
            <h3 id={`${titleId}-provenance`}>Provenance</h3>
            <dl>
              <div>
                <dt>Captured</dt>
                <dd>
                  <time dateTime={note.capturedAt}>
                    {formatDateTime(note.capturedAt)}
                  </time>
                </dd>
              </div>
              {note.captureChannel && (
                <div>
                  <dt>Capture channel</dt>
                  <dd>{CAPTURE_CHANNEL_LABELS[note.captureChannel]}</dd>
                </div>
              )}
              <div>
                <dt>Source</dt>
                <dd>
                  {sourceUrl ? (
                    <a href={sourceUrl} target="_blank" rel="noreferrer">
                      {sourceTitle ?? 'Open source'}
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  ) : (
                    (sourceTitle ?? 'Personal note')
                  )}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </dialog>
  );
}
