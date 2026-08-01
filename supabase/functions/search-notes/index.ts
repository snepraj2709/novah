import { functionEnvironment } from '../_shared/environment.ts';
import { createHttpHandler } from '../_shared/http.ts';
import { OpenAiProvider } from '../_shared/openai.ts';
import { handleSearchNotes } from '../_shared/search-handler.ts';
import { SupabaseRequestContext } from '../_shared/supabase-context.ts';

export default {
  fetch(request: Request): Promise<Response> {
    const environment = functionEnvironment();
    const context = new SupabaseRequestContext(
      environment.supabaseUrl,
      environment.supabasePublishableKey,
    );
    return createHttpHandler(
      (incomingRequest) =>
        handleSearchNotes(incomingRequest, {
          authenticator: context,
          repository: context,
          ai: new OpenAiProvider(environment.openAiApiKey),
        }),
      environment.cors,
    )(request);
  },
};
