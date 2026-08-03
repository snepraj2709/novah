import type { DashboardNote } from '../lib/dashboard.ts';
import { formatDateTime } from '../lib/time.ts';

function noteTypeLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

export function NoteCard({
  note,
  onOpen,
  onDelete,
  onActivate,
  onReread,
}: {
  note: DashboardNote;
  onOpen: (note: DashboardNote) => void;
  onDelete?: (note: DashboardNote) => void;
  onActivate?: (note: DashboardNote) => void;
  onReread?: (note: DashboardNote) => void;
}) {
  const typeLabel = noteTypeLabel(note.noteType);
  const accessibleTypeLabel = typeLabel.endsWith('note')
    ? typeLabel
    : `${typeLabel} note`;

  return (
    <article className="note-card">
      <div
        className="note-card-trigger"
        role="button"
        tabIndex={0}
        aria-label={`Open full ${accessibleTypeLabel}`}
        onClick={() => onOpen(note)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(note);
          }
        }}
      >
        <h3 className="sr-only">{accessibleTypeLabel}</h3>
        <div className="note-card-topline">
          <span className="type-pill">{typeLabel}</span>
          <time dateTime={note.capturedAt}>
            {formatDateTime(note.capturedAt)}
          </time>
        </div>
        <p className="original-note">{note.originalText}</p>
        {note.personalContext && (
          <blockquote>
            <span>Why it mattered</span>
            {note.personalContext}
          </blockquote>
        )}
      </div>
      <footer>
        <div className="source-line">
          <span>
            {note.sourceTitle ?? 'Personal note'} ·{' '}
            {note.practice
              ? note.practice.status === 'active'
                ? `Practising${note.practice.nextDueOn ? ` · due ${note.practice.nextDueOn}` : ''}`
                : note.practice.status
              : 'Saved'}
          </span>
        </div>
        {!note.practice && onActivate && (
          <button
            type="button"
            className="button ghost"
            onClick={() => onActivate(note)}
          >
            Keep this with me
          </button>
        )}
        {note.practice?.status === 'active' && onReread && (
          <button
            type="button"
            className="button primary"
            onClick={() => onReread(note)}
          >
            Reread
          </button>
        )}
        {note.practice && (
          <div className="button-row note-card-writing-actions">
            <button
              type="button"
              className="button ghost"
              onClick={() => onOpen(note)}
            >
              Reflect
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => onOpen(note)}
            >
              Add story
            </button>
          </div>
        )}
        {onDelete && (
          <button
            type="button"
            className="text-button danger-text"
            onClick={() => onDelete(note)}
          >
            Delete
          </button>
        )}
      </footer>
    </article>
  );
}
