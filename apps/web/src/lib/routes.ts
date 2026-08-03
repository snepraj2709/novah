export const AUTHENTICATED_ROUTES = [
  '/practice',
  '/collection',
  '/settings',
] as const;

export type AuthenticatedRoute = (typeof AUTHENTICATED_ROUTES)[number];
export type AppRoute = AuthenticatedRoute | '/privacy' | '/not-found';

export function routeFromPath(pathname: string): AppRoute {
  if (pathname === '/privacy') return '/privacy';
  if (pathname === '/') return '/practice';
  return (
    AUTHENTICATED_ROUTES.find((route) => route === pathname) ?? '/not-found'
  );
}

export function navigate(path: AppRoute, replace = false): void {
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
