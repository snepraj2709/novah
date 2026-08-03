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
import type { ManagePracticeRequest } from '@novah/shared/contracts';

import { managePractice, WebApiError } from '../lib/api.ts';
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

function nextCalendarDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
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
  localDate,
}: {
  note: DashboardNote;
  onClose: () => void;
  onPracticeUpdated?: (practice: DashboardPractice) => void;
  localDate?: string;
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
  const entryRetry = useRef<
    Record<'reflection' | 'story', { text: string; key: string } | null>
  >({ reflection: null, story: null });
  const [practice, setPractice] = useState(note.practice);
  const [intervalDays, setIntervalDays] = useState(
    note.practice?.intervalDays ?? 1,
  );
  const [resumeOn, setResumeOn] = useState('');
  const [lifecycleBusy, setLifecycleBusy] = useState<string | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

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
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
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
    const previousAttempt = entryRetry.current[entryKind];
    const retry =
      previousAttempt?.text === text
        ? previousAttempt
        : { text, key: crypto.randomUUID() };
    entryRetry.current[entryKind] = retry;
    setSaving(entryKind);
    setEntryError(null);
    try {
      const result = await managePractice(
        {
          action: 'addEntry',
          noteId: note.id,
          entryKind,
          text,
        },
        retry.key,
      );
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
      entryRetry.current[entryKind] = null;
      setPractice(result.practice);
      setIntervalDays(result.practice.intervalDays);
      onPracticeUpdated?.(result.practice);
    } catch (cause) {
      setEntryError(errorMessage(cause, 'Practice entry could not be saved.'));
    } finally {
      setSaving(null);
    }
  }

  async function updatePractice(
    request: Exclude<ManagePracticeRequest, { action: 'addEntry' }>,
  ) {
    if (lifecycleBusy) return;
    setLifecycleBusy(request.action);
    setLifecycleError(null);
    try {
      const result = await managePractice(request);
      setPractice(result.practice);
      setIntervalDays(result.practice.intervalDays);
      if (request.action === 'pause') setResumeOn('');
      onPracticeUpdated?.(result.practice);
    } catch (cause) {
      setLifecycleError(
        cause instanceof WebApiError && cause.code === 'practice_slots_full'
          ? 'All three Practice slots are in use. Pause or integrate one before resuming.'
          : errorMessage(cause, 'Practice could not be updated.'),
      );
    } finally {
      setLifecycleBusy(null);
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
            {practice ? (
              <>
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {practice.status === 'active'
                        ? 'Practising'
                        : practice.status === 'paused' && practice.readyToResume
                          ? 'Paused · Ready to resume'
                          : practice.status}
                    </dd>
                  </div>
                  <div>
                    <dt>Interval</dt>
                    <dd>
                      {practice.intervalDays}{' '}
                      {practice.intervalDays === 1 ? 'day' : 'days'}
                    </dd>
                  </div>
                  {practice.nextDueOn && (
                    <div>
                      <dt>Next due</dt>
                      <dd>{practice.nextDueOn}</dd>
                    </div>
                  )}
                  {practice.pausedUntil && (
                    <div>
                      <dt>Resume date</dt>
                      <dd>{practice.pausedUntil}</dd>
                    </div>
                  )}
                  {practice.status === 'integrated' && (
                    <div>
                      <dt>Next check-in</dt>
                      <dd>
                        {practice.checkInsEnabled
                          ? (practice.nextCheckInOn ?? 'Waiting')
                          : 'Stopped'}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="practice-lifecycle-controls">
                  {practice.status === 'active' && (
                    <>
                      <div className="button-row">
                        <button
                          type="button"
                          className="button primary"
                          disabled={lifecycleBusy !== null}
                          onClick={() =>
                            void updatePractice({
                              action: 'reread',
                              noteId: note.id,
                            })
                          }
                        >
                          Reread
                        </button>
                        <button
                          type="button"
                          className="button ghost"
                          disabled={lifecycleBusy !== null}
                          onClick={() =>
                            void updatePractice({
                              action: 'integrate',
                              noteId: note.id,
                            })
                          }
                        >
                          Integrated
                        </button>
                      </div>

                      <div className="practice-control-row">
                        <label htmlFor={`${titleId}-interval`}>
                          Interval
                          <select
                            id={`${titleId}-interval`}
                            value={intervalDays}
                            disabled={lifecycleBusy !== null}
                            onChange={(event) =>
                              setIntervalDays(Number(event.target.value))
                            }
                          >
                            {Array.from(
                              { length: 30 },
                              (_, index) => index + 1,
                            ).map((days) => (
                              <option key={days} value={days}>
                                {days} {days === 1 ? 'day' : 'days'}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="button ghost"
                          disabled={
                            lifecycleBusy !== null ||
                            intervalDays === practice.intervalDays
                          }
                          onClick={() =>
                            void updatePractice({
                              action: 'setInterval',
                              noteId: note.id,
                              intervalDays,
                            })
                          }
                        >
                          Change interval
                        </button>
                      </div>

                      <div className="practice-control-row">
                        <label htmlFor={`${titleId}-resume-on`}>
                          Resume date (optional)
                          <input
                            id={`${titleId}-resume-on`}
                            type="date"
                            value={resumeOn}
                            min={
                              localDate
                                ? nextCalendarDate(localDate)
                                : undefined
                            }
                            disabled={lifecycleBusy !== null}
                            onChange={(event) =>
                              setResumeOn(event.target.value)
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="button ghost"
                          disabled={lifecycleBusy !== null}
                          onClick={() =>
                            void updatePractice({
                              action: 'pause',
                              noteId: note.id,
                              ...(resumeOn ? { resumeOn } : {}),
                            })
                          }
                        >
                          {resumeOn ? 'Pause until date' : 'Pause indefinitely'}
                        </button>
                      </div>
                    </>
                  )}

                  {practice.status === 'paused' && (
                    <div className="button-row">
                      <button
                        type="button"
                        className="button primary"
                        disabled={lifecycleBusy !== null}
                        onClick={() =>
                          void updatePractice({
                            action: 'resume',
                            noteId: note.id,
                          })
                        }
                      >
                        Resume practice
                      </button>
                      <button
                        type="button"
                        className="button ghost"
                        disabled={lifecycleBusy !== null}
                        onClick={() =>
                          void updatePractice({
                            action: 'integrate',
                            noteId: note.id,
                          })
                        }
                      >
                        Integrated
                      </button>
                    </div>
                  )}

                  {practice.status === 'integrated' && (
                    <div className="button-row">
                      {practice.checkInsEnabled &&
                        practice.nextCheckInOn &&
                        localDate &&
                        practice.nextCheckInOn <= localDate && (
                          <button
                            type="button"
                            className="button primary"
                            disabled={lifecycleBusy !== null}
                            onClick={() =>
                              void updatePractice({
                                action: 'confirmIntegrated',
                                noteId: note.id,
                              })
                            }
                          >
                            Still integrated
                          </button>
                        )}
                      <button
                        type="button"
                        className="button ghost"
                        disabled={lifecycleBusy !== null}
                        onClick={() =>
                          void updatePractice({
                            action: 'resume',
                            noteId: note.id,
                          })
                        }
                      >
                        Resume practice
                      </button>
                      {practice.checkInsEnabled && (
                        <button
                          type="button"
                          className="button ghost"
                          disabled={lifecycleBusy !== null}
                          onClick={() =>
                            void updatePractice({
                              action: 'stopCheckIns',
                              noteId: note.id,
                            })
                          }
                        >
                          Stop check-ins
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {lifecycleError && (
                  <p className="message error" role="alert">
                    {lifecycleError}
                  </p>
                )}
              </>
            ) : (
              <div className="practice-lifecycle-controls">
                <p>Saved only.</p>
                <button
                  type="button"
                  className="button primary"
                  disabled={lifecycleBusy !== null}
                  onClick={() =>
                    void updatePractice({ action: 'activate', noteId: note.id })
                  }
                >
                  Keep this with me
                </button>
                {lifecycleError && (
                  <p className="message error" role="alert">
                    {lifecycleError}
                  </p>
                )}
              </div>
            )}
          </section>

          <section aria-labelledby={`${titleId}-full-note`}>
            <h3 className="eyebrow" id={`${titleId}-full-note`}>
              Full note
            </h3>
            <p className="note-detail-original">{note.originalText}</p>
          </section>

          {practice && (
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
                    onChange={(event) => {
                      entryRetry.current.reflection = null;
                      setReflection(event.target.value);
                    }}
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
                    onChange={(event) => {
                      entryRetry.current.story = null;
                      setStory(event.target.value);
                    }}
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
