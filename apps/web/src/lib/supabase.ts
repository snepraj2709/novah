import { createClient } from '@supabase/supabase-js';
import type { Database } from '@novah/shared/types';

import { getPublicWebConfig } from './config.ts';

const configuration = getPublicWebConfig();
const AUTH_STORAGE_KEY = 'novah-web-auth-session';

export const supabase = createClient<Database>(
  configuration.supabaseUrl,
  configuration.supabasePublishableKey,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storageKey: AUTH_STORAGE_KEY,
    },
  },
);

export function clearDeletedAccountSession(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.location.replace('/practice');
}
