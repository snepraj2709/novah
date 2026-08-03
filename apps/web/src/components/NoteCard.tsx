import type { DashboardNote } from '../lib/dashboard.ts';
import { formatDateTime } from '../lib/time.ts';

function noteTypeLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

export function NoteCard({
  note,
  onOpen,
  onDelete,
}: {
  note: DashboardNote;
  onOpen: (note: DashboardNote) => void;
  onDelete?: (note: DashboardNote) => void;
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
        <div className="source-line"></div>
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
