import type { CorsConfiguration } from './http.ts';

export interface FunctionEnvironment {
  openAiApiKey: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  cors: CorsConfiguration;
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function functionEnvironment(): FunctionEnvironment {
  const supabaseUrl = required('SUPABASE_URL');
  const publishableKey =
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? required('SUPABASE_ANON_KEY');
  return {
    openAiApiKey: required('OPENAI_API_KEY'),
    supabaseUrl,
    supabasePublishableKey: publishableKey,
    cors: {
      appUrl: Deno.env.get('APP_URL'),
      extensionIds: (Deno.env.get('ALLOWED_EXTENSION_IDS') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      allowLocalDevelopment:
        supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost'),
    },
  };
}
