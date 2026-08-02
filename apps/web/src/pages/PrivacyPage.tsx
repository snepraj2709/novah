import { navigate } from '../lib/routes.ts';

export function PrivacyPage({ signedIn }: { signedIn: boolean }) {
  return (
    <main className="policy-layout">
      <header className="policy-header">
        <button
          type="button"
          className="wordmark wordmark-button"
          onClick={() => navigate('/today')}
        >
          <span className="brand-mark">N</span>
          Novah
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={() => navigate('/today')}
        >
          {signedIn ? 'Back to Novah' : 'Sign in'}
        </button>
      </header>
      <article className="policy-card">
        <p className="eyebrow">Privacy policy</p>
        <h1>Your notes are personal. Novah treats them that way.</h1>
        <p className="policy-updated">Effective 2 August 2026</p>

        <section>
          <h2>What Novah stores</h2>
          <p>
            Novah stores your account details, saved note text, optional
            personal context, source details, generated summaries and tags,
            embeddings, digests, review history, and delivery settings in
            Supabase. These records are scoped to your authenticated account.
          </p>
        </section>
        <section>
          <h2>How AI processing works</h2>
          <p>
            Note enrichment, search synthesis, embeddings, and transcription use
            OpenAI APIs. Novah sends only the information needed for the
            requested feature and uses <code>store: false</code> for
            text-generation calls. Novah does not use web search or unrelated
            notes to answer library questions.
          </p>
        </section>
        <section>
          <h2>Telegram</h2>
          <p>
            Messages sent to the Novah bot pass through Telegram infrastructure.
            Text and transcriptions may be saved as notes after your chat is
            linked. Voice files are held only long enough to enforce limits and
            transcribe them; Novah does not persist raw audio.
          </p>
        </section>
        <section>
          <h2>Sharing and analytics</h2>
          <p>
            Novah does not sell your data, show advertising, or send note
            content to third-party analytics. Data is shared only with the
            infrastructure providers required to authenticate, store, process,
            and deliver your requested features.
          </p>
        </section>
        <section>
          <h2>Your controls</h2>
          <p>
            You can export your library as JSON or Markdown, delete individual
            notes, disconnect by removing account data, or permanently delete
            your account from Settings. Note deletion also removes its review
            events. Account deletion removes your owned Novah records through
            database cascades.
          </p>
        </section>
        <section>
          <h2>Security and retention</h2>
          <p>
            Row Level Security isolates user-owned records. Telegram link codes
            are random, hashed, single-use, and expire after ten minutes. Novah
            retains your data until you delete it or delete your account, except
            where infrastructure providers must retain limited operational data.
          </p>
        </section>
      </article>
    </main>
  );
}
