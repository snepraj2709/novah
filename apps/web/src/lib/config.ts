const NOVAH_PROJECT_URL = 'https://fqinppulljqefbvukcpg.supabase.co';

export interface PublicWebConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export function getPublicWebConfig(): PublicWebConfig {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/u, '');
  const supabasePublishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Novah web configuration is incomplete.');
  }
  const local = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/u.test(
    supabaseUrl,
  );
  if (supabaseUrl !== NOVAH_PROJECT_URL && !local) {
    throw new Error('Novah web is configured for an unexpected project.');
  }
  return { supabaseUrl, supabasePublishableKey };
}
