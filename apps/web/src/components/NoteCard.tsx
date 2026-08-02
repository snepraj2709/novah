import type { DashboardNote } from '../lib/dashboard.ts';
import { formatDateTime } from '../lib/time.ts';

function noteTypeLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

export function NoteCard({
  note,
  onDelete,
}: {
  note: DashboardNote;
  onDelete?: (note: DashboardNote) => void;
}) {
  return (
    <article className="note-card">
      <h3 className="sr-only">{noteTypeLabel(note.noteType)} note</h3>
      <div className="note-card-topline">
        <span className="type-pill">{noteTypeLabel(note.noteType)}</span>
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
      <footer>
        <div className="source-line">
          {note.sourceUrl ? (
            <a href={note.sourceUrl} target="_blank" rel="noreferrer">
              {note.sourceTitle ?? 'Open source'} ↗
            </a>
          ) : (
            <span>{note.sourceTitle ?? 'Personal note'}</span>
          )}
        </div>
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
