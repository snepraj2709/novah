const SUPABASE_PROJECT_URL = 'https://fqinppulljqefbvukcpg.supabase.co';

export interface PublicExtensionConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export function getPublicExtensionConfig(): PublicExtensionConfig {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/u, '');
  const supabasePublishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Novah extension configuration is incomplete.');
  }

  if (supabaseUrl !== SUPABASE_PROJECT_URL) {
    throw new Error('Novah extension is configured for an unexpected project.');
  }

  return { supabaseUrl, supabasePublishableKey };
}

export const EXPECTED_EXTENSION_ID = 'illdnfhcgdhkgbifepbejobplgikmmlp';
