import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import type { SearchNotesResponse } from '@novah/shared/contracts';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../components/AsyncState.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { NoteCard } from '../components/NoteCard.tsx';
import { searchNotes } from '../lib/api.ts';
import {
  deleteOwnedNote,
  loadAllNotes,
  loadLibraryPage,
  NOTE_TYPES,
  searchMatchNote,
  type DashboardNote,
  type NoteType,
} from '../lib/dashboard.ts';
import { errorMessage } from '../lib/errors.ts';
import { downloadText, jsonExport, markdownExport } from '../lib/export.ts';

const PAGE_SIZE = 6;

export function LibraryPage({ userId }: { userId: string }) {
  const [noteType, setNoteType] = useState<NoteType | 'all'>('all');
  const [page, setPage] = useState(0);
  const [notes, setNotes] = useState<DashboardNote[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<SearchNotesResponse | null>(
    null,
  );
  const [searching, setSearching] = useState(false);
  const [exporting, setExporting] = useState<'json' | 'markdown' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardNote | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (searchResult) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadLibraryPage({
        userId,
        noteType,
        page,
        pageSize: PAGE_SIZE,
      });
      setNotes(result.notes);
      setTotal(result.total);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [noteType, page, searchResult, userId]);

  useEffect(() => void load(), [load]);

  const filteredSearchNotes = useMemo(
    () =>
      (searchResult?.matches ?? [])
        .map(searchMatchNote)
        .filter((note) => noteType === 'all' || note.noteType === noteType),
    [noteType, searchResult],
  );
  const visibleSearchNotes = filteredSearchNotes.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );
  const visibleNotes = searchResult ? visibleSearchNotes : notes;
  const visibleTotal = searchResult ? filteredSearchNotes.length : total;
  const pageCount = Math.max(1, Math.ceil(visibleTotal / PAGE_SIZE));

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) {
      setSearchResult(null);
      setPage(0);
      return;
    }
    setSearching(true);
    setError(null);
    setPage(0);
    try {
      setSearchResult(await searchNotes({ query: normalized, limit: 20 }));
    } catch (cause) {
      setError(errorMessage(cause, 'Search could not be completed.'));
    } finally {
      setSearching(false);
      setLoading(false);
    }
  }

  async function exportLibrary(format: 'json' | 'markdown') {
    setExporting(format);
    setError(null);
    try {
      const allNotes = await loadAllNotes(userId);
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      if (format === 'json') {
        downloadText(
          `novah-export-${date}.json`,
          jsonExport(allNotes, now),
          'application/json;charset=utf-8',
        );
      } else {
        downloadText(
          `novah-export-${date}.md`,
          markdownExport(allNotes, now),
          'text/markdown;charset=utf-8',
        );
      }
    } catch (cause) {
      setError(errorMessage(cause, 'Your export could not be prepared.'));
    } finally {
      setExporting(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteOwnedNote(deleteTarget.id);
      if (searchResult) {
        setSearchResult({
          ...searchResult,
          matches: searchResult.matches.filter(
            (match) => match.noteId !== deleteTarget.id,
          ),
          citations: [],
          answer: null,
          synthesisWithheld: true,
        });
      } else {
        setNotes((current) =>
          current.filter((note) => note.id !== deleteTarget.id),
        );
        setTotal((current) => Math.max(0, current - 1));
        if (notes.length === 1 && page > 0) setPage(page - 1);
      }
      setDeleteTarget(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-heading split-heading">
        <div>
          <p className="eyebrow">Everything you kept</p>
          <h1>Library</h1>
          <p>
            Browse chronologically or ask a grounded question across your notes.
          </p>
        </div>
        <div className="button-row export-buttons">
          <button
            className="button ghost"
            type="button"
            disabled={Boolean(exporting)}
            onClick={() => void exportLibrary('json')}
          >
            {exporting === 'json' ? 'Preparing…' : 'Export JSON'}
          </button>
          <button
            className="button ghost"
            type="button"
            disabled={Boolean(exporting)}
            onClick={() => void exportLibrary('markdown')}
          >
            {exporting === 'markdown' ? 'Preparing…' : 'Export Markdown'}
          </button>
        </div>
      </header>

      <section className="library-toolbar" aria-label="Library controls">
        <form className="search-form" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="library-search">
            Search your library
          </label>
          <input
            id="library-search"
            type="search"
            value={query}
            placeholder="What have I saved about…"
            maxLength={500}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="button primary" type="submit" disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
        <label className="filter-control">
          <span>Type</span>
          <select
            value={noteType}
            onChange={(event) => {
              setNoteType(event.target.value as NoteType | 'all');
              setPage(0);
              setQuery('');
              setSearchResult(null);
            }}
          >
            {NOTE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {searchResult && (
        <section className="search-answer" aria-live="polite">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Grounded recall</p>
              <h2>
                {searchResult.synthesisWithheld
                  ? 'Possible matches'
                  : 'What your notes say'}
              </h2>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setQuery('');
                setSearchResult(null);
                setPage(0);
              }}
            >
              Clear search
            </button>
          </div>
          <p>
            {searchResult.answer ??
              'Novah found related notes but withheld an answer because the evidence was not strong enough.'}
          </p>
        </section>
      )}

      {error ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : loading && !searchResult ? (
        <LoadingState label="Opening your library…" />
      ) : visibleNotes.length === 0 ? (
        <EmptyState
          title={searchResult ? 'No matching notes' : 'Your library is empty'}
          message={
            searchResult
              ? 'Try a broader question or another note type.'
              : 'Capture an idea from the extension or Telegram and it will appear here.'
          }
        />
      ) : (
        <>
          <div className="results-meta">
            <span>
              {visibleTotal} {visibleTotal === 1 ? 'note' : 'notes'}
            </span>
            <span>
              Page {page + 1} of {pageCount}
            </span>
          </div>
          <div className="note-grid">
            {visibleNotes.map((note) => (
              <NoteCard key={note.id} note={note} onDelete={setDeleteTarget} />
            ))}
          </div>
          {pageCount > 1 && (
            <nav className="pagination" aria-label="Library pages">
              <button
                className="button ghost"
                type="button"
                disabled={page === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
              >
                Previous
              </button>
              <span>
                {page + 1} / {pageCount}
              </span>
              <button
                className="button ghost"
                type="button"
                disabled={page + 1 >= pageCount}
                onClick={() =>
                  setPage((value) => Math.min(pageCount - 1, value + 1))
                }
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this note?"
          message="This permanently removes the note and its five review events. Export first if you may need it later."
          confirmLabel="Delete note"
          destructive
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}
