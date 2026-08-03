import type { CorsConfiguration } from './http.ts';

export interface FunctionEnvironment {
  openAiApiKey: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  cors: CorsConfiguration;
}

export type PublicFunctionEnvironment = Omit<
  FunctionEnvironment,
  'openAiApiKey'
>;

export interface TelegramFunctionEnvironment {
  openAiApiKey: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  telegramBotToken: string;
  telegramWebhookSecret: string;
}

export interface NotificationFunctionEnvironment {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  telegramBotToken: string;
  cronSecret: string;
}

export interface AccountDeletionFunctionEnvironment extends PublicFunctionEnvironment {
  supabaseServiceRoleKey: string;
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function isLocalSupabaseRuntimeUrl(value: string): boolean {
  try {
    return new Set([
      '127.0.0.1',
      'localhost',
      'kong',
      'host.docker.internal',
    ]).has(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function publicFunctionEnvironment(): PublicFunctionEnvironment {
  const supabaseUrl = required('SUPABASE_URL');
  const publishableKey =
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? required('SUPABASE_ANON_KEY');
  return {
    supabaseUrl,
    supabasePublishableKey: publishableKey,
    cors: {
      appUrl: Deno.env.get('APP_URL'),
      extensionIds: (Deno.env.get('ALLOWED_EXTENSION_IDS') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      allowLocalDevelopment: isLocalSupabaseRuntimeUrl(supabaseUrl),
    },
  };
}

export function functionEnvironment(): FunctionEnvironment {
  return {
    ...publicFunctionEnvironment(),
    openAiApiKey: required('OPENAI_API_KEY'),
  };
}

export function telegramFunctionEnvironment(): TelegramFunctionEnvironment {
  return {
    openAiApiKey: required('OPENAI_API_KEY'),
    supabaseUrl: required('SUPABASE_URL'),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
    telegramWebhookSecret: required('TELEGRAM_WEBHOOK_SECRET'),
  };
}

export function notificationFunctionEnvironment(): NotificationFunctionEnvironment {
  return {
    supabaseUrl: required('SUPABASE_URL'),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
    cronSecret: required('CRON_SECRET'),
  };
}

export function accountDeletionFunctionEnvironment(): AccountDeletionFunctionEnvironment {
  return {
    ...publicFunctionEnvironment(),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  };
}
