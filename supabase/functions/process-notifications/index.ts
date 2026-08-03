import { notificationFunctionEnvironment } from '../_shared/environment.ts';
import { createNotificationHandler } from '../_shared/notification-handler.ts';
import { SupabaseNotificationRepository } from '../_shared/notification-supabase.ts';
import { TelegramApiClient } from '../_shared/telegram-api.ts';

export default {
  fetch(request: Request): Promise<Response> {
    const environment = notificationFunctionEnvironment();
    return createNotificationHandler({
      cronSecret: environment.cronSecret,
      repository: new SupabaseNotificationRepository(
        environment.supabaseUrl,
        environment.supabaseServiceRoleKey,
      ),
      telegram: new TelegramApiClient(environment.telegramBotToken),
    })(request);
  },
};
