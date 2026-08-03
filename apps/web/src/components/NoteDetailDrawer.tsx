import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { MAX_PRACTICE_ENTRY_TEXT_LENGTH } from '@novah/shared';

import { managePractice } from '../lib/api.ts';
import {
  loadPracticeEntries,
  type DashboardNote,
  type DashboardPractice,
  type DashboardPracticeEntry,
} from '../lib/dashboard.ts';
import { errorMessage } from '../lib/errors.ts';
import { practicePrompt } from '../lib/practice.ts';
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
  onPracticeUpdated,
}: {
  note: DashboardNote;
  onClose: () => void;
  onPracticeUpdated?: (practice: DashboardPractice) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const hasPersonalContext = Boolean(note.personalContext?.trim());
  const sourceTitle = note.sourceTitle?.trim() || null;
  const sourceUrl = note.sourceUrl?.trim() || null;
  const [entries, setEntries] = useState<DashboardPracticeEntry[] | null>(null);
  const [reflection, setReflection] = useState('');
  const [story, setStory] = useState('');
  const [promptVisible, setPromptVisible] = useState(false);
  const [saving, setSaving] = useState<'reflection' | 'story' | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);

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

  useEffect(() => {
    let active = true;
    setEntries(null);
    setEntryError(null);
    void loadPracticeEntries(note.id)
      .then((loaded) => {
        if (active) setEntries(loaded);
      })
      .catch((cause) => {
        if (active) {
          setEntryError(
            errorMessage(cause, 'Practice thread could not be loaded.'),
          );
          setEntries([]);
        }
      });
    return () => {
      active = false;
    };
  }, [note.id]);

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
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled])',
      ),
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

  async function addEntry(
    event: FormEvent<HTMLFormElement>,
    entryKind: 'reflection' | 'story',
  ) {
    event.preventDefault();
    const text = entryKind === 'reflection' ? reflection : story;
    if (!text.trim() || saving) return;
    setSaving(entryKind);
    setEntryError(null);
    try {
      const result = await managePractice({
        action: 'addEntry',
        noteId: note.id,
        entryKind,
        text,
      });
      if (!result.entry) throw new Error('Practice entry is missing.');
      setEntries((current) =>
        [...(current ?? []), result.entry!].sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.id.localeCompare(right.id),
        ),
      );
      if (entryKind === 'reflection') setReflection('');
      else setStory('');
      onPracticeUpdated?.(result.practice);
    } catch (cause) {
      setEntryError(errorMessage(cause, 'Practice entry could not be saved.'));
    } finally {
      setSaving(null);
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

          {note.practice && (
            <section
              className="practice-writing"
              aria-labelledby={`${titleId}-writing`}
            >
              <h3 id={`${titleId}-writing`}>Reflection and Story</h3>
              <p>Writing is optional. Entries are saved to this thread.</p>

              <div className="practice-prompt">
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setPromptVisible(true)}
                >
                  Give me a prompt
                </button>
                {promptVisible && entries !== null && (
                  <p role="status">{practicePrompt(note.id, entries.length)}</p>
                )}
              </div>

              <div className="practice-entry-forms">
                <form onSubmit={(event) => void addEntry(event, 'reflection')}>
                  <label htmlFor={`${titleId}-reflection`}>Reflection</label>
                  <textarea
                    id={`${titleId}-reflection`}
                    value={reflection}
                    maxLength={MAX_PRACTICE_ENTRY_TEXT_LENGTH}
                    rows={4}
                    onChange={(event) => setReflection(event.target.value)}
                  />
                  <button
                    type="submit"
                    className="button primary"
                    disabled={!reflection.trim() || saving !== null}
                  >
                    {saving === 'reflection' ? 'Saving…' : 'Add Reflection'}
                  </button>
                </form>

                <form onSubmit={(event) => void addEntry(event, 'story')}>
                  <label htmlFor={`${titleId}-story`}>Story</label>
                  <textarea
                    id={`${titleId}-story`}
                    value={story}
                    maxLength={MAX_PRACTICE_ENTRY_TEXT_LENGTH}
                    rows={4}
                    onChange={(event) => setStory(event.target.value)}
                  />
                  <button
                    type="submit"
                    className="button primary"
                    disabled={!story.trim() || saving !== null}
                  >
                    {saving === 'story' ? 'Saving…' : 'Add Story'}
                  </button>
                </form>
              </div>

              {entryError && (
                <p className="message error" role="alert">
                  {entryError}
                </p>
              )}

              <div className="practice-thread" aria-live="polite">
                <h4>Practice thread</h4>
                {entries === null ? (
                  <p>Loading entries…</p>
                ) : entries.length === 0 ? (
                  <p>No Reflection or Story entries yet.</p>
                ) : (
                  <ol>
                    {entries.map((entry) => (
                      <li key={entry.id}>
                        <div>
                          <strong>
                            {entry.kind === 'reflection'
                              ? 'Reflection'
                              : 'Story'}
                          </strong>
                          <time dateTime={entry.createdAt}>
                            {formatDateTime(entry.createdAt)}
                          </time>
                        </div>
                        <p>{entry.text}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          )}

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
