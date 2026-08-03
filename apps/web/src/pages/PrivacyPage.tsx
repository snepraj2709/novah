import { navigate } from '../lib/routes.ts';

export function PrivacyPage({ signedIn }: { signedIn: boolean }) {
  return (
    <main className="policy-layout">
      <header className="policy-header">
        <button
          type="button"
          className="wordmark wordmark-button"
          onClick={() => navigate('/practice')}
        >
          <span className="brand-mark">N</span>
          Novah
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={() => navigate('/practice')}
        >
          {signedIn ? 'Back to Novah' : 'Sign in'}
        </button>
      </header>
      <article className="policy-card">
        <p className="eyebrow">Privacy policy</p>
        <h1>Your notes are personal. Novah treats them that way.</h1>
        <p className="policy-updated">Effective 3 August 2026</p>

        <section>
          <h2>What Novah stores</h2>
          <p>
            Novah stores your account details, saved note text, optional
            personal context, source details, assigned Type, embeddings,
            Practice state, content-free Practice events, and delivery settings
            in Supabase. Legacy digest and Review records remain until the
            separately approved final cleanup. Legacy summaries, tags, and
            recall prompts may remain on historical notes until you delete the
            note or account; new captures do not generate them. These records
            are scoped to your authenticated account.
          </p>
        </section>
        <section>
          <h2>How AI processing works</h2>
          <p>
            Note-type classification, embeddings, grounded Find synthesis, and
            voice transcription use OpenAI APIs. Novah sends only the
            information needed for the requested feature and uses{' '}
            <code>store: false</code> for text-generation calls. Classification
            receives note text and optional context only when you omit Type.
            Embeddings receive the capture evidence or Find query; synthesis
            receives only its grounded original-note evidence. Transcription
            receives the bounded voice file. Novah does not use web search or
            unrelated notes to answer Collection questions.
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
            You can export your Collection as JSON version 2 or Markdown, delete
            individual notes, disconnect by removing account data, or
            permanently delete your account from Settings. Exports intentionally
            contain notes only: Reflection and Story entries are not included.
            Note and account deletion remove owned Practice data through
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
        <section>
          <h2>Purpose, providers, and changes</h2>
          <p>
            Novah processes data to authenticate you, provide the features you
            request, secure the private beta, and operate it. Supabase, OpenAI,
            Telegram, and the web host receive only the information needed for
            their role. Material policy changes will be communicated through the
            beta invitation channel with a new effective date.
          </p>
        </section>
        <section>
          <h2>Questions or deletion help</h2>
          <p>
            Contact the beta operator through your invitation channel if you
            need help accessing, exporting, or deleting your information.
          </p>
        </section>
      </article>
    </main>
  );
}
