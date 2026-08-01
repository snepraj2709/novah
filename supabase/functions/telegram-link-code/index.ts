import { publicFunctionEnvironment } from '../_shared/environment.ts';
import { createHttpHandler } from '../_shared/http.ts';
import { SupabaseRequestContext } from '../_shared/supabase-context.ts';
import { handleTelegramLinkCode } from '../_shared/telegram-link-handler.ts';

export default {
  fetch(request: Request): Promise<Response> {
    const environment = publicFunctionEnvironment();
    const context = new SupabaseRequestContext(
      environment.supabaseUrl,
      environment.supabasePublishableKey,
    );
    return createHttpHandler(
      (incomingRequest) =>
        handleTelegramLinkCode(incomingRequest, {
          authenticator: context,
          repository: context,
        }),
      environment.cors,
    )(request);
  },
};
