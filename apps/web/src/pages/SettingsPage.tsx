import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';

import { ErrorState, LoadingState } from '../components/AsyncState.tsx';
import { deleteAccount, generateTelegramLinkCode } from '../lib/api.ts';
import {
  loadProfile,
  updateProfileSettings,
  type ProfileSettings,
} from '../lib/dashboard.ts';
import { errorMessage } from '../lib/errors.ts';
import { clearDeletedAccountSession, supabase } from '../lib/supabase.ts';
import { formatDateTime } from '../lib/time.ts';

const FALLBACK_TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'America/Los_Angeles',
  'America/New_York',
  'Europe/London',
  'Europe/Paris',
  'Asia/Singapore',
  'Australia/Sydney',
];

function supportedTimezones(current: string): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[];
  };
  const values = intl.supportedValuesOf?.('timeZone') ?? [];
  return [...new Set([current, ...FALLBACK_TIMEZONES, ...values])].sort();
}

export function SettingsPage({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const [profile, setProfile] = useState<ProfileSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkCode, setLinkCode] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [linking, setLinking] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfile(await loadProfile(userId));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => void load(), [load]);

  const timezones = useMemo(
    () => supportedTimezones(profile?.timezone ?? 'Asia/Kolkata'),
    [profile?.timezone],
  );

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await updateProfileSettings(userId, profile);
      setNotice('Delivery settings saved.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function createLinkCode() {
    setLinking(true);
    setError(null);
    setNotice(null);
    try {
      const result = await generateTelegramLinkCode();
      if (result.connected) {
        setProfile((current) =>
          current ? { ...current, telegramConnected: true } : current,
        );
        setNotice('Telegram is already connected.');
        setLinkCode(null);
      } else if (result.code && result.expiresAt) {
        setLinkCode({ code: result.code, expiresAt: result.expiresAt });
      } else {
        throw new Error('A Telegram link code could not be generated.');
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLinking(false);
    }
  }

  async function confirmAccountDeletion(event: FormEvent) {
    event.preventDefault();
    if (!password) return;
    setDeleting(true);
    setError(null);
    try {
      const reauthenticated = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (reauthenticated.error) throw reauthenticated.error;
      await deleteAccount();
      clearDeletedAccountSession();
    } catch (cause) {
      setError(
        errorMessage(
          cause,
          'Account deletion failed. Your account and notes were not changed.',
        ),
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <LoadingState label="Loading your settings…" />;
  if (error && !profile) {
    return <ErrorState message={error} retry={() => void load()} />;
  }
  if (!profile) return null;

  return (
    <div className="page-stack">
      <header className="page-heading">
        <p className="eyebrow">Your routine</p>
        <h1>Settings</h1>
        <p>
          Choose when Novah returns your ideas and connect Telegram capture.
        </p>
      </header>

      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="form-message success" role="status">
          {notice}
        </p>
      )}

      <section className="settings-card" aria-labelledby="delivery-title">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Delivery</p>
            <h2 id="delivery-title">Your local schedule</h2>
          </div>
        </div>
        <form className="settings-form" onSubmit={save}>
          <label>
            Timezone
            <select
              value={profile.timezone}
              onChange={(event) =>
                setProfile({ ...profile, timezone: event.target.value })
              }
            >
              {timezones.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
          </label>
          <label>
            Daily digest
            <input
              type="time"
              value={profile.digestTime}
              onChange={(event) =>
                setProfile({ ...profile, digestTime: event.target.value })
              }
              required
            />
          </label>
          <label>
            Review packet
            <input
              type="time"
              value={profile.reviewTime}
              onChange={(event) =>
                setProfile({ ...profile, reviewTime: event.target.value })
              }
              required
            />
          </label>
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save schedule'}
          </button>
        </form>
      </section>

      <section className="settings-card" aria-labelledby="telegram-title">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Capture and delivery</p>
            <h2 id="telegram-title">Telegram</h2>
          </div>
          <span
            className={`status-pill ${profile.telegramConnected ? 'connected' : ''}`}
          >
            {profile.telegramConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        {profile.telegramConnected ? (
          <p>
            Your bot can receive captures and send scheduled digests and
            reviews.
          </p>
        ) : (
          <>
            <p>
              Generate a single-use code, then send <code>/link CODE</code> to
              the Novah bot within ten minutes.
            </p>
            <button
              className="button secondary"
              type="button"
              disabled={linking}
              onClick={() => void createLinkCode()}
            >
              {linking ? 'Generating…' : 'Generate link code'}
            </button>
          </>
        )}
        {linkCode && (
          <div className="link-code" role="status">
            <strong>{linkCode.code}</strong>
            <span>Expires {formatDateTime(linkCode.expiresAt)}</span>
          </div>
        )}
      </section>

      <section
        className="settings-card danger-zone"
        aria-labelledby="danger-title"
      >
        <p className="eyebrow">Danger zone</p>
        <h2 id="danger-title">Delete your account</h2>
        <p>
          Permanently remove your account, notes, digests, reviews, and delivery
          settings. Export your library first.
        </p>
        {!showDelete ? (
          <button
            className="button danger"
            type="button"
            onClick={() => setShowDelete(true)}
          >
            Delete account
          </button>
        ) : (
          <form
            className="delete-account-form"
            onSubmit={confirmAccountDeletion}
          >
            <label>
              Re-enter your password to confirm
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <div className="button-row">
              <button
                className="button ghost"
                type="button"
                disabled={deleting}
                onClick={() => {
                  setShowDelete(false);
                  setPassword('');
                }}
              >
                Cancel
              </button>
              <button
                className="button danger"
                type="submit"
                disabled={deleting || !password}
              >
                {deleting ? 'Deleting…' : 'Permanently delete account'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
