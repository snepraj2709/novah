import { useCallback, useEffect, useState } from 'react';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../components/AsyncState.tsx';
import { NoteCard, type PracticeCardAction } from '../components/NoteCard.tsx';
import { NoteDetailDrawer } from '../components/NoteDetailDrawer.tsx';
import { managePractice, WebApiError } from '../lib/api.ts';
import {
  loadPracticePage,
  loadProfile,
  type DashboardNote,
  type PracticePageData,
} from '../lib/dashboard.ts';
import { errorMessage } from '../lib/errors.ts';

export function PracticePage({ userId }: { userId: string }) {
  const [data, setData] = useState<PracticePageData | null>(null);
  const [detailNote, setDetailNote] = useState<DashboardNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await loadProfile(userId);
      setData(await loadPracticePage(userId, profile.timezone));
    } catch (cause) {
      setError(errorMessage(cause, 'Practice could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => void load(), [load]);

  async function reread(note: DashboardNote) {
    setError(null);
    try {
      await managePractice({ action: 'reread', noteId: note.id });
      setDetailNote(null);
      await load();
    } catch (cause) {
      setError(errorMessage(cause, 'Reread could not be recorded.'));
    }
  }

  async function lifecycle(note: DashboardNote, action: PracticeCardAction) {
    setError(null);
    try {
      const result = await managePractice({ action, noteId: note.id });
      setDetailNote((current) =>
        current?.id === note.id
          ? { ...current, practice: result.practice }
          : current,
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof WebApiError && cause.code === 'practice_slots_full'
          ? 'All three Practice slots are in use. Pause or integrate one before resuming.'
          : errorMessage(cause, 'Practice could not be updated.'),
      );
    }
  }

  if (error && !data)
    return <ErrorState message={error} retry={() => void load()} />;
  if (loading && !data) return <LoadingState label="Opening Practice…" />;

  const sections = [
    {
      title: 'Due now',
      notes: data?.due ?? [],
      reread: true,
      checkInWaiting: false,
    },
    {
      title: 'Coming up',
      notes: data?.upcoming ?? [],
      reread: false,
      checkInWaiting: false,
    },
    {
      title: 'Ready to resume',
      notes: data?.readyToResume ?? [],
      reread: false,
      checkInWaiting: false,
    },
    {
      title: 'Integration check-ins',
      notes: data?.integratedWaiting ?? [],
      reread: false,
      checkInWaiting: true,
    },
  ];

  return (
    <div className="page-stack">
      <header className="page-heading split-heading">
        <div>
          <p className="eyebrow">Keep chosen notes close</p>
          <h1>Practice</h1>
          <p>Rereading is a complete encounter. Writing is optional.</p>
        </div>
        <div className="metric-card" aria-label="Active Practice slots">
          <strong>{data?.activeCount ?? 0} / 3</strong>
          <span>active slots</span>
        </div>
      </header>

      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {sections.every((section) => section.notes.length === 0) ? (
        <EmptyState
          title="Nothing in Practice yet"
          message="Open Collection and choose Keep this with me on a saved note."
        />
      ) : (
        sections.map((section) =>
          section.notes.length > 0 ? (
            <section key={section.title} className="page-stack">
              <div className="section-title-row">
                <h2>{section.title}</h2>
              </div>
              <div className="note-grid">
                {section.notes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onOpen={setDetailNote}
                    onPracticeAction={(selected, action) =>
                      void lifecycle(selected, action)
                    }
                    checkInWaiting={section.checkInWaiting}
                    showFullNote
                    {...(section.reread
                      ? {
                          onReread: (selected: DashboardNote) =>
                            void reread(selected),
                        }
                      : {})}
                  />
                ))}
              </div>
            </section>
          ) : null,
        )
      )}

      {detailNote && (
        <NoteDetailDrawer
          note={detailNote}
          localDate={data?.localDate}
          onClose={() => setDetailNote(null)}
          onPracticeUpdated={(practice) => {
            setDetailNote((current) =>
              current ? { ...current, practice } : current,
            );
            void load();
          }}
        />
      )}
    </div>
  );
}
