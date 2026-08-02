import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import './App.css';
import { LoadingState } from './components/AsyncState.tsx';
import { routeFromPath, navigate, type AppRoute } from './lib/routes.ts';
import { supabase } from './lib/supabase.ts';
import { AuthPage } from './pages/AuthPage.tsx';
import { LibraryPage } from './pages/LibraryPage.tsx';
import { PrivacyPage } from './pages/PrivacyPage.tsx';
import { ReviewPage } from './pages/ReviewPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { TodayPage } from './pages/TodayPage.tsx';

const NAVIGATION: Array<{ route: AppRoute; label: string; glyph: string }> = [
  { route: '/today', label: 'Today', glyph: '☀' },
  { route: '/library', label: 'Library', glyph: '▤' },
  { route: '/review', label: 'Review', glyph: '↻' },
  { route: '/settings', label: 'Settings', glyph: '⚙' },
];

function DashboardShell({
  session,
  route,
}: {
  session: Session;
  route: AppRoute;
}) {
  async function signOut() {
    await supabase.auth.signOut({ scope: 'local' });
    navigate('/today', true);
  }

  const page = (() => {
    if (route === '/library') return <LibraryPage userId={session.user.id} />;
    if (route === '/review') return <ReviewPage userId={session.user.id} />;
    if (route === '/settings') {
      return (
        <SettingsPage
          userId={session.user.id}
          email={session.user.email ?? ''}
        />
      );
    }
    return <TodayPage userId={session.user.id} />;
  })();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="wordmark wordmark-button"
          type="button"
          onClick={() => navigate('/today')}
        >
          <span className="brand-mark">N</span>
          Novah
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          {NAVIGATION.map((item) => (
            <button
              key={item.route}
              type="button"
              className={route === item.route ? 'active' : ''}
              aria-current={route === item.route ? 'page' : undefined}
              onClick={() => navigate(item.route)}
            >
              <span aria-hidden="true">{item.glyph}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-account">
          <span className="account-email" title={session.user.email}>
            {session.user.email}
          </span>
          <button
            className="text-button"
            type="button"
            onClick={() => navigate('/privacy')}
          >
            Privacy
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="dashboard-main">{page}</main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAVIGATION.map((item) => (
          <button
            key={item.route}
            type="button"
            className={route === item.route ? 'active' : ''}
            aria-current={route === item.route ? 'page' : undefined}
            onClick={() => navigate(item.route)}
          >
            <span aria-hidden="true">{item.glyph}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [route, setRoute] = useState<AppRoute>(() =>
    routeFromPath(window.location.pathname),
  );

  useEffect(() => {
    const onRoute = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', onRoute);
    return () => window.removeEventListener('popstate', onRoute);
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!authReady) {
    return (
      <main className="boot-state">
        <LoadingState label="Opening Novah…" />
      </main>
    );
  }
  if (route === '/privacy') return <PrivacyPage signedIn={Boolean(session)} />;
  if (!session) return <AuthPage />;
  return <DashboardShell session={session} route={route} />;
}

export default App;
