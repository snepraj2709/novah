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
      <div className="note-card-topline">
        <span className="type-pill">{noteTypeLabel(note.noteType)}</span>
        <time dateTime={note.capturedAt}>
          {formatDateTime(note.capturedAt)}
        </time>
      </div>
      <h2>{note.summary}</h2>
      <p className="original-note">{note.originalText}</p>
      {note.personalContext && (
        <blockquote>
          <span>Why it mattered</span>
          {note.personalContext}
        </blockquote>
      )}
      <div className="tag-row" aria-label="Tags">
        {note.tags.map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
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
