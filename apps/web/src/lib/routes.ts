export const AUTHENTICATED_ROUTES = [
  '/today',
  '/library',
  '/review',
  '/settings',
] as const;

export type AuthenticatedRoute = (typeof AUTHENTICATED_ROUTES)[number];
export type AppRoute = AuthenticatedRoute | '/privacy';

export function routeFromPath(pathname: string): AppRoute {
  if (pathname === '/privacy') return '/privacy';
  return AUTHENTICATED_ROUTES.find((route) => route === pathname) ?? '/today';
}

export function navigate(path: AppRoute, replace = false): void {
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
