import { telegramFunctionEnvironment } from '../_shared/environment.ts';
import { OpenAiProvider } from '../_shared/openai.ts';
import { TelegramApiClient } from '../_shared/telegram-api.ts';
import { createTelegramWebhookHandler } from '../_shared/telegram-handler.ts';
import { TelegramKnowledgePipeline } from '../_shared/telegram-knowledge.ts';
import { SupabaseTelegramRepository } from '../_shared/telegram-supabase.ts';
import { OpenAiVoiceTranscriber } from '../_shared/transcription.ts';

export default {
  fetch(request: Request): Promise<Response> {
    const environment = telegramFunctionEnvironment();
    const repository = new SupabaseTelegramRepository(
      environment.supabaseUrl,
      environment.supabaseServiceRoleKey,
    );
    return createTelegramWebhookHandler({
      webhookSecret: environment.telegramWebhookSecret,
      repository,
      knowledge: new TelegramKnowledgePipeline(
        repository,
        new OpenAiProvider(environment.openAiApiKey),
      ),
      telegram: new TelegramApiClient(environment.telegramBotToken),
      transcriber: new OpenAiVoiceTranscriber(environment.openAiApiKey),
    })(request);
  },
};
