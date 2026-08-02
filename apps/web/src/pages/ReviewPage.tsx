import { useCallback, useEffect, useState } from 'react';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../components/AsyncState.tsx';
import {
  loadProfile,
  loadReviews,
  type ReviewData,
  type ReviewItem,
} from '../lib/dashboard.ts';
import { errorMessage } from '../lib/errors.ts';
import { navigate } from '../lib/routes.ts';
import { formatDate, formatDateTime } from '../lib/time.ts';

function statusLabel(status: string): string {
  if (status === 'partial') return 'Partly remembered';
  return `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;
}

function ReviewRow({
  item,
  completed = false,
}: {
  item: ReviewItem;
  completed?: boolean;
}) {
  return (
    <article className="review-row">
      <div className="review-stage">{item.stage}</div>
      <div className="review-copy">
        <div className="note-card-topline">
          <span>
            {completed
              ? statusLabel(item.status)
              : `Due ${formatDate(item.dueOn)}`}
          </span>
          {completed && item.answeredAt && (
            <time dateTime={item.answeredAt}>
              {formatDateTime(item.answeredAt)}
            </time>
          )}
        </div>
        <h3>{item.prompt}</h3>
        <p>{item.sourceTitle ?? 'Personal note'}</p>
      </div>
    </article>
  );
}

export function ReviewPage({ userId }: { userId: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await loadProfile(userId);
      setData(await loadReviews(userId, profile.timezone));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => void load(), [load]);

  if (loading) return <LoadingState label="Checking your review queue…" />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  if (!data) return null;

  return (
    <div className="page-stack">
      <header className="page-heading split-heading">
        <div>
          <p className="eyebrow">Spaced recall</p>
          <h1>Review</h1>
          <p>See what is due and how previous recall sessions went.</p>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => navigate('/settings')}
        >
          Review schedule
        </button>
      </header>

      <section className="review-summary" aria-label="Review summary">
        <div>
          <strong>{data.due.length}</strong>
          <span>due now</span>
        </div>
        <div>
          <strong>{data.upcoming.length}</strong>
          <span>upcoming</span>
        </div>
        <div>
          <strong>{data.completed.length}</strong>
          <span>completed</span>
        </div>
      </section>

      <section className="review-section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Due</p>
            <h2>Recall before revealing</h2>
          </div>
          <span className="count-badge">{data.due.length}</span>
        </div>
        {data.due.length === 0 ? (
          <EmptyState
            title="Nothing due right now"
            message="Novah will send your next review packet through Telegram at your scheduled local time."
          />
        ) : (
          <div className="review-list">
            {data.due.map((item) => (
              <ReviewRow item={item} key={item.id} />
            ))}
          </div>
        )}
      </section>

      <section className="review-section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">History</p>
            <h2>Completed reviews</h2>
          </div>
          <span className="count-badge">{data.completed.length}</span>
        </div>
        {data.completed.length === 0 ? (
          <EmptyState
            title="No completed reviews yet"
            message="Use the buttons in your Telegram review packet to record remembered, partial, missed, or skipped feedback."
          />
        ) : (
          <div className="review-list">
            {data.completed.map((item) => (
              <ReviewRow item={item} key={item.id} completed />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
