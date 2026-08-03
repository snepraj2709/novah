import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { errorMessage } from '../lib/errors.ts';
import { navigate } from '../lib/routes.ts';
import { supabase } from '../lib/supabase.ts';

type AuthMode = 'sign-in' | 'sign-up';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
    <main className="auth-layout">
      <section className="auth-story">
        <div className="wordmark">
          <span className="brand-mark">N</span>
          Novah
        </div>
        <div>
          <p className="eyebrow">Your private knowledge practice</p>
          <h1>Keep what matters. Find it when it matters.</h1>
          <p className="auth-lede">
            Capture ideas from the web and Telegram, find them by meaning, and
            deliberately practise the notes you want to keep close.
          </p>
        </div>
        <p className="privacy-inline">
          No ads. No content analytics. Your notes stay private to your account.
        </p>
      </section>

      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-card">
          <p className="eyebrow">
            {mode === 'sign-in' ? 'Welcome back' : 'Start your library'}
          </p>
          <h2 id="auth-title">
            {mode === 'sign-in' ? 'Sign in to Novah' : 'Create your account'}
          </h2>
          <p className="muted">
            {mode === 'sign-in'
              ? 'Your Collection, Practice, and settings are waiting.'
              : 'Use email and a password of at least eight characters.'}
          </p>
          <form className="form-stack" onSubmit={submit}>
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
              <span className="relative block">
                <input
                  className="w-full pr-12"
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete={
                    mode === 'sign-in' ? 'current-password' : 'new-password'
                  }
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-0 text-[var(--muted)] hover:text-[var(--green)]"
                  aria-label={
                    passwordVisible ? 'Hide password' : 'Show password'
                  }
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  {passwordVisible ? (
                    <EyeOff size={20} aria-hidden="true" />
                  ) : (
                    <Eye size={20} aria-hidden="true" />
                  )}
                </button>
              </span>
            </label>
            {error && (
              <p className="form-message error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="form-message success" role="status">
                {message}
              </p>
            )}
            <button
              className="button primary full"
              type="submit"
              disabled={busy}
            >
              {busy
                ? 'Please wait…'
                : mode === 'sign-in'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
          <button
            type="button"
            className="text-button auth-switch"
            onClick={() => {
              setMode((current) =>
                current === 'sign-in' ? 'sign-up' : 'sign-in',
              );
              setPasswordVisible(false);
              setError(null);
              setMessage(null);
            }}
          >
            {mode === 'sign-in'
              ? 'New to Novah? Create an account'
              : 'Already have an account? Sign in'}
          </button>
        </div>
        <button
          type="button"
          className="text-button privacy-link"
          onClick={() => navigate('/privacy')}
        >
          Read the privacy policy
        </button>
      </section>
    </main>
  );
}
