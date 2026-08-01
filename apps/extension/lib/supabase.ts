import { createClient } from '@supabase/supabase-js';
import type { Database } from '@novah/shared/types';

import { extensionAuthStorage } from './browser-storage.ts';
import { getPublicExtensionConfig } from './config.ts';

const configuration = getPublicExtensionConfig();

export const supabase = createClient<Database>(
  configuration.supabaseUrl,
  configuration.supabasePublishableKey,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storage: extensionAuthStorage(),
      storageKey: 'novah-auth-session',
    },
  },
);
