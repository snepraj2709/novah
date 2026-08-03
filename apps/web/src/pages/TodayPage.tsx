import { useCallback, useEffect, useState } from 'react';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../components/AsyncState.tsx';
import { NoteCard } from '../components/NoteCard.tsx';
import { NoteDetailDrawer } from '../components/NoteDetailDrawer.tsx';
import {
  loadProfile,
  loadToday,
  type DashboardNote,
  type TodayData,
} from '../lib/dashboard.ts';
import { errorMessage } from '../lib/errors.ts';
import { navigate } from '../lib/routes.ts';
import { formatDate } from '../lib/time.ts';

export function TodayPage({ userId }: { userId: string }) {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailNote, setDetailNote] = useState<DashboardNote | null>(null);

  const load = useCallback(async () => {
    setDetailNote(null);
    setLoading(true);
    setError(null);
    try {
      const profile = await loadProfile(userId);
      setData(await loadToday(userId, profile.timezone));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => void load(), [load]);

  if (loading) return <LoadingState label="Gathering what you kept today…" />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  if (!data) return null;

  return (
    <div className="page-stack">
      <header className="page-heading split-heading">
        <div>
          <p className="eyebrow">{formatDate(data.localDate)}</p>
          <h1>Today</h1>
          <p>See what you captured and the connections Novah found.</p>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => navigate('/collection')}
        >
          Open library
        </button>
      </header>

      {data.notes.length === 0 ? (
        <EmptyState
          title="Nothing saved today—yet"
          message="Use the Chrome extension or send a message to your linked Telegram bot. Your captures will appear here."
          action={
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate('/settings')}
            >
              Connect Telegram
            </button>
          }
        />
      ) : (
        <>
          <section className="metric-strip" aria-label="Today's summary">
            <div>
              <strong>{data.notes.length}</strong>
              <span>{data.notes.length === 1 ? 'capture' : 'captures'}</span>
            </div>
            <div>
              <strong>
                {new Set(data.notes.map((note) => note.noteType)).size}
              </strong>
              <span>idea types</span>
            </div>
            <div>
              <strong>
                {
                  new Set(
                    data.notes.flatMap((note) => {
                      const source = note.sourceUrl ?? note.sourceTitle;
                      return source ? [source] : [];
                    }),
                  ).size
                }
              </strong>
              <span>distinct sources</span>
            </div>
          </section>

          {data.digest && (
            <section className="digest-card" aria-labelledby="digest-title">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">Daily digest</p>
                  <h2 id="digest-title">Patterns worth carrying forward</h2>
                </div>
                <span className="count-badge">
                  {data.digest.captureCount} notes
                </span>
              </div>
              {data.digest.themes.map((theme) => (
                <div
                  className="digest-block"
                  key={`${theme.title}-${theme.noteIds.join('-')}`}
                >
                  <p>{theme.title}</p>
                </div>
              ))}
              {data.digest.connection && (
                <div className="digest-block accent-block">
                  <span>Useful connection</span>
                  <p>{data.digest.connection.text}</p>
                </div>
              )}
              <div className="reflection-prompt">
                <span>For tomorrow</span>
                <p>{data.digest.reflectionQuestion}</p>
              </div>
            </section>
          )}

          <section>
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Captured today</p>
                <h2>Your notes</h2>
              </div>
            </div>
            <div className="note-grid">
              {data.notes.map((note) => (
                <NoteCard note={note} key={note.id} onOpen={setDetailNote} />
              ))}
            </div>
          </section>
        </>
      )}

      {detailNote && (
        <NoteDetailDrawer
          note={detailNote}
          onClose={() => setDetailNote(null)}
        />
      )}
    </div>
  );
}
