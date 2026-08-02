import { handleAccountDeletion } from '../_shared/account-deletion-handler.ts';
import { SupabaseAccountDeletionRepository } from '../_shared/account-deletion-supabase.ts';
import { accountDeletionFunctionEnvironment } from '../_shared/environment.ts';
import { createHttpHandler } from '../_shared/http.ts';
import { SupabaseRequestContext } from '../_shared/supabase-context.ts';

export default {
  fetch(request: Request): Promise<Response> {
    const environment = accountDeletionFunctionEnvironment();
    const authenticator = new SupabaseRequestContext(
      environment.supabaseUrl,
      environment.supabasePublishableKey,
    );
    const repository = new SupabaseAccountDeletionRepository(
      environment.supabaseUrl,
      environment.supabaseServiceRoleKey,
    );
    return createHttpHandler(
      (incomingRequest) =>
        handleAccountDeletion(incomingRequest, {
          authenticator,
          repository,
        }),
      environment.cors,
    )(request);
  },
};
