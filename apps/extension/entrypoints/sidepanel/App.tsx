import type { Session } from '@supabase/supabase-js';
import type {
  CaptureNoteResponse,
  SearchNotesResponse,
  TelegramLinkCodeResponse,
} from '@novah/shared/contracts';
import { NOTE_TYPES as SHARED_NOTE_TYPES } from '@novah/shared/constants';
import type { NoteType } from '@novah/shared/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import {
  captureNote,
  ExtensionApiError,
  generateTelegramLinkCode,
  searchNotes,
} from '../../lib/api.ts';
import { answerSegments } from '../../lib/citations.ts';
import {
  activateDraft,
  addDraft,
  createCaptureDraft,
  emptyDraftCollection,
  isHttpUrl,
  markDraftFailed,
  removeDraft,
  updateDraft,
  validateDraft,
  type CaptureDraft,
  type DraftCollection,
  type DraftFieldErrors,
} from '../../lib/draft-model.ts';
import {
  loadDraftCollection,
  saveDraftCollection,
  subscribeToDraftCollection,
} from '../../lib/draft-storage.ts';
import { supabase } from '../../lib/supabase.ts';

type Tab = 'capture' | 'recall' | 'settings';
type AuthMode = 'sign-in' | 'create-account';

const NOTE_TYPES: Array<{ value: NoteType; label: string }> = [
  ...SHARED_NOTE_TYPES.map((value) => ({
    value,
    label: value
      .split('_')
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join(' '),
  })),
];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function shortDraftLabel(draft: CaptureDraft): string {
  const firstLine = draft.originalText
    .trim()
    .split(/\s+/u)
    .slice(0, 7)
    .join(' ');
  return firstLine || 'Untitled draft';
}

function AuthPanel({ hasDraft }: { hasDraft: boolean }) {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === 'sign-in') {
        const result = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (result.error) throw result.error;
      } else {
        const result = await supabase.auth.signUp({ email, password });
        if (result.error) throw result.error;
        if (!result.data.session) {
          setMessage('Check your email to confirm your account, then sign in.');
        }
      }
    } catch (cause) {
      setError(errorMessage(cause, 'Authentication failed. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">Private by default</p>
      <h2 id="auth-title">
        {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
      </h2>
      <p className="subtle">
        {hasDraft
          ? 'Your captured draft is safe on this device. Sign in to save it.'
          : 'Sign in to capture ideas and recall what matters.'}
      </p>
      <form onSubmit={submit} className="stack">
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={
              mode === 'sign-in' ? 'current-password' : 'new-password'
            }
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </label>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="message success" role="status">
            {message}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy
            ? 'Please wait…'
            : mode === 'sign-in'
              ? 'Sign in'
              : 'Create account'}
        </button>
      </form>
      <button
        className="text-button"
        type="button"
        onClick={() => {
          setMode(mode === 'sign-in' ? 'create-account' : 'sign-in');
          setError(null);
          setMessage(null);
        }}
      >
        {mode === 'sign-in'
          ? 'Need an account? Create one'
          : 'Already have an account? Sign in'}
      </button>
    </section>
  );
}

interface CapturePanelProps {
  collection: DraftCollection;
  setCollection: (collection: DraftCollection) => Promise<void>;
}

function CapturePanel({ collection, setCollection }: CapturePanelProps) {
  const activeDraft = collection.drafts.find(
    (draft) => draft.clientRequestId === collection.activeId,
  );
  const [fieldErrors, setFieldErrors] = useState<DraftFieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<CaptureNoteResponse['note'] | null>(null);
  const savingRef = useRef(false);

  async function createNewDraft(): Promise<CaptureDraft> {
    setFieldErrors({});
    setSaved(null);
    const draft = createCaptureDraft();
    await setCollection(addDraft(collection, draft));
    return draft;
  }

  function patchDraft(patch: Partial<CaptureDraft>) {
    if (!activeDraft) return;
    void setCollection(
      updateDraft(collection, activeDraft.clientRequestId, patch),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!activeDraft || savingRef.current) return;
    const validation = validateDraft(activeDraft);
    if (!validation.success) {
      setFieldErrors(validation.fieldErrors);
      return;
    }

    savingRef.current = true;
    setBusy(true);
    setFieldErrors({});
    try {
      const result = await captureNote(validation.request);
      setSaved(result.note);
      await setCollection(removeDraft(collection, activeDraft.clientRequestId));
    } catch (cause) {
      const message = errorMessage(
        cause,
        'Capture failed. Your draft is safe.',
      );
      await setCollection(
        markDraftFailed(collection, activeDraft.clientRequestId, message),
      );
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  if (!activeDraft) {
    return (
      <section className="empty-card">
        {saved ? (
          <>
            <div className="success-mark" aria-hidden="true">
              ✓
            </div>
            <h2>Saved to Novah</h2>
            <p>{saved.summary}</p>
            <div className="tag-row">
              {saved.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <p className="subtle">First review: {saved.firstReviewDate}</p>
          </>
        ) : (
          <>
            <h2>Capture what matters</h2>
            <p>
              Select text on a page and choose “Save to Novah,” or start a note
              here.
            </p>
          </>
        )}
        <button
          className="primary"
          type="button"
          onClick={() => void createNewDraft()}
        >
          {saved ? 'Capture another' : 'New note'}
        </button>
      </section>
    );
  }

  return (
    <section>
      {saved && (
        <div className="message success capture-success" role="status">
          Saved to Novah: {saved.summary}
        </div>
      )}
      <div className="section-heading">
        <div>
          <p className="eyebrow">Capture</p>
          <h2>
            {activeDraft.origin === 'selection'
              ? 'Review selection'
              : 'New note'}
          </h2>
        </div>
        <button
          className="secondary compact"
          type="button"
          onClick={() => void createNewDraft()}
        >
          New
        </button>
      </div>

      {collection.drafts.length > 1 && (
        <label className="draft-picker">
          Saved drafts
          <select
            value={activeDraft.clientRequestId}
            onChange={(event) => {
              setFieldErrors({});
              setSaved(null);
              void setCollection(activateDraft(collection, event.target.value));
            }}
          >
            {collection.drafts.map((draft) => (
              <option key={draft.clientRequestId} value={draft.clientRequestId}>
                {draft.status === 'failed' ? 'Retry: ' : ''}
                {shortDraftLabel(draft)}
              </option>
            ))}
          </select>
        </label>
      )}

      <form onSubmit={submit} className="stack capture-form">
        <label>
          Note <span aria-hidden="true">*</span>
          <textarea
            rows={7}
            value={activeDraft.originalText}
            onChange={(event) =>
              patchDraft({ originalText: event.target.value })
            }
            aria-invalid={Boolean(fieldErrors.originalText)}
          />
          {fieldErrors.originalText && (
            <span className="field-error">{fieldErrors.originalText}</span>
          )}
        </label>
        <label>
          Why does this matter to you?
          <textarea
            rows={3}
            placeholder="Optional personal context"
            value={activeDraft.personalContext}
            onChange={(event) =>
              patchDraft({ personalContext: event.target.value })
            }
            aria-invalid={Boolean(fieldErrors.personalContext)}
          />
          {fieldErrors.personalContext && (
            <span className="field-error">{fieldErrors.personalContext}</span>
          )}
        </label>
        <label>
          Type
          <select
            value={activeDraft.noteType}
            onChange={(event) =>
              patchDraft({ noteType: event.target.value as NoteType | '' })
            }
          >
            <option value="">Let Novah decide</option>
            {NOTE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <div className="source-grid">
          <label>
            Source title
            <input
              value={activeDraft.sourceTitle}
              onChange={(event) =>
                patchDraft({ sourceTitle: event.target.value })
              }
              aria-invalid={Boolean(fieldErrors.sourceTitle)}
            />
            {fieldErrors.sourceTitle && (
              <span className="field-error">{fieldErrors.sourceTitle}</span>
            )}
          </label>
          <label>
            Source URL
            <input
              type="url"
              placeholder="https://…"
              value={activeDraft.sourceUrl}
              onChange={(event) =>
                patchDraft({
                  sourceUrl: event.target.value,
                  sourceUnavailable: false,
                })
              }
              aria-invalid={Boolean(fieldErrors.sourceUrl)}
            />
            {fieldErrors.sourceUrl && (
              <span className="field-error">{fieldErrors.sourceUrl}</span>
            )}
          </label>
        </div>
        {activeDraft.sourceUnavailable && (
          <p className="message info">
            Chrome did not expose a shareable URL for this page or PDF. You can
            paste one above, or save without it.
          </p>
        )}
        {activeDraft.status === 'failed' && (
          <p className="message error" role="alert">
            {activeDraft.lastError ?? 'Capture failed. Your draft is safe.'}
          </p>
        )}
        <div className="button-row">
          <button className="primary" type="submit" disabled={busy}>
            {busy
              ? 'Saving…'
              : activeDraft.status === 'failed'
                ? 'Retry save'
                : 'Save to Novah'}
          </button>
          <button
            className="text-button danger"
            type="button"
            disabled={busy}
            onClick={() =>
              void setCollection(
                removeDraft(collection, activeDraft.clientRequestId),
              )
            }
          >
            Discard
          </button>
        </div>
      </form>
    </section>
  );
}

function CitationAnswer({ result }: { result: SearchNotesResponse }) {
  if (result.synthesisWithheld || !result.answer) {
    return (
      <div className="message info">
        I found related notes below, but not enough evidence for a reliable
        answer.
      </div>
    );
  }
  return (
    <div className="answer-card">
      <p>
        {answerSegments(result.answer, result.citations).map(
          (segment, index) =>
            segment.type === 'citation' ? (
              <a
                key={`${segment.noteId}-${index}`}
                href={`#note-${segment.noteId}`}
                aria-label={`Go to source ${segment.number}`}
              >
                {segment.value}
              </a>
            ) : (
              <span key={index}>{segment.value}</span>
            ),
        )}
      </p>
    </div>
  );
}

function RecallPanel() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchNotesResponse | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await searchNotes({ query, limit: 5 }));
    } catch (cause) {
      setError(
        cause instanceof ExtensionApiError
          ? cause.message
          : errorMessage(cause, 'Recall failed. Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Recall</p>
          <h2>Ask your notes</h2>
        </div>
      </div>
      <form onSubmit={submit} className="search-form">
        <label className="sr-only" htmlFor="recall-query">
          What do you want to recall?
        </label>
        <textarea
          id="recall-query"
          rows={3}
          placeholder="What did I save about…?"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={500}
          required
        />
        <button
          className="primary"
          type="submit"
          disabled={busy || !query.trim()}
        >
          {busy ? 'Searching…' : 'Recall'}
        </button>
      </form>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {result && result.matches.length === 0 && (
        <div className="empty-card compact-empty">
          <h3>No matching notes</h3>
          <p>Try a different phrase or capture a note first.</p>
        </div>
      )}
      {result && result.matches.length > 0 && (
        <div className="results" aria-live="polite">
          <CitationAnswer result={result} />
          <h3>
            {result.matches.length} ranked{' '}
            {result.matches.length === 1 ? 'note' : 'notes'}
          </h3>
          {result.matches.map((match, index) => (
            <article
              className="note-card"
              id={`note-${match.noteId}`}
              key={match.noteId}
            >
              <div className="note-rank">
                <span>#{index + 1}</span>
                <span>{Math.round(match.similarity * 100)}% match</span>
              </div>
              <p className="note-text">{match.originalText}</p>
              {match.personalContext && (
                <p className="context">“{match.personalContext}”</p>
              )}
              <p className="summary">{match.summary}</p>
              <div className="tag-row">
                {match.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <footer>
                <span>
                  {match.noteType} ·{' '}
                  {new Date(match.capturedAt).toLocaleDateString()}
                </span>
                {match.sourceUrl && isHttpUrl(match.sourceUrl) ? (
                  <a href={match.sourceUrl} target="_blank" rel="noreferrer">
                    {match.sourceTitle || 'Open source'} ↗
                  </a>
                ) : match.sourceTitle ? (
                  <span>{match.sourceTitle}</span>
                ) : null}
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SettingsPanel() {
  const [link, setLink] = useState<TelegramLinkCodeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateCode() {
    setBusy(true);
    setError(null);
    try {
      setLink(await generateTelegramLinkCode());
    } catch (cause) {
      setError(errorMessage(cause, 'Could not create a Telegram link code.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Connect Telegram</h2>
        </div>
      </div>
      <p className="subtle">
        Generate a one-time code, then send it to the Novah bot from the private
        Telegram chat you want to connect.
      </p>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {link && (
        <div className="telegram-link-card" aria-live="polite">
          <p className="connection-status">
            {link.connected
              ? 'A Telegram chat is already connected.'
              : 'No Telegram chat is connected yet.'}
          </p>
          <code aria-label="Telegram link code">{link.code}</code>
          <p>
            Send <strong>/link {link.code}</strong> to the Novah bot. This code
            expires at {new Date(link.expiresAt).toLocaleTimeString()} and works
            once.
          </p>
        </div>
      )}
      <button
        className="primary"
        type="button"
        disabled={busy}
        onClick={() => void generateCode()}
      >
        {busy ? 'Generating…' : link ? 'Generate a new code' : 'Generate code'}
      </button>
      <p className="privacy-note">
        Telegram messages pass through Telegram infrastructure. Novah never
        stores raw voice audio.
      </p>
    </section>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('capture');
  const [collection, setCollectionState] = useState<DraftCollection>(
    emptyDraftCollection(),
  );

  useEffect(() => {
    let active = true;
    void Promise.all([supabase.auth.getSession(), loadDraftCollection()])
      .then(([auth, drafts]) => {
        if (!active) return;
        setSession(auth.data.session);
        setCollectionState(drafts);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) =>
      setSession(nextSession),
    );
    const unsubscribeDrafts = subscribeToDraftCollection(setCollectionState);
    return () => {
      active = false;
      data.subscription.unsubscribe();
      unsubscribeDrafts();
    };
  }, []);

  const activeDraft = useMemo(
    () =>
      collection.drafts.find(
        (draft) => draft.clientRequestId === collection.activeId,
      ),
    [collection],
  );

  async function setCollection(next: DraftCollection) {
    setCollectionState(next);
    await saveDraftCollection(next);
  }

  return (
    <main>
      <header className="app-header">
        <div>
          <div className="brand">N</div>
          <div>
            <h1>Novah</h1>
            <p>Save what matters.</p>
          </div>
        </div>
        {session && (
          <button
            className="text-button"
            type="button"
            onClick={() => void supabase.auth.signOut()}
          >
            Sign out
          </button>
        )}
      </header>

      {authLoading ? (
        <div className="loading-state" role="status">
          <span className="spinner" />
          Opening Novah…
        </div>
      ) : !session ? (
        <AuthPanel hasDraft={Boolean(activeDraft)} />
      ) : (
        <>
          <nav className="tabs" aria-label="Novah tools">
            <button
              type="button"
              className={tab === 'capture' ? 'active' : ''}
              onClick={() => setTab('capture')}
            >
              Capture
            </button>
            <button
              type="button"
              className={tab === 'recall' ? 'active' : ''}
              onClick={() => setTab('recall')}
            >
              Recall
            </button>
            <button
              type="button"
              className={tab === 'settings' ? 'active' : ''}
              onClick={() => setTab('settings')}
            >
              Settings
            </button>
          </nav>
          <div className="content">
            {tab === 'capture' ? (
              <CapturePanel
                collection={collection}
                setCollection={setCollection}
              />
            ) : tab === 'recall' ? (
              <RecallPanel />
            ) : (
              <SettingsPanel />
            )}
          </div>
        </>
      )}
    </main>
  );
}
