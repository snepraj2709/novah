import {
  MAX_NOTE_TEXT_LENGTH,
  OPENAI_TRANSCRIPTION_MODEL,
} from '../../../packages/shared/src/constants/index.ts';
import { ApiError } from './errors.ts';
import type { VoiceTranscriber } from './telegram-types.ts';

type Fetch = typeof fetch;

function transcriptionUnavailable(): ApiError {
  return new ApiError(
    503,
    'ai_unavailable',
    'Voice transcription is temporarily unavailable.',
    true,
  );
}

export class OpenAiVoiceTranscriber implements VoiceTranscriber {
  private readonly apiKey: string;
  private readonly request: Fetch;

  constructor(apiKey: string, request: Fetch = fetch) {
    this.apiKey = apiKey;
    this.request = request;
  }

  async transcribe(audio: Uint8Array, mimeType: string): Promise<string> {
    const form = new FormData();
    const audioBuffer = new ArrayBuffer(audio.byteLength);
    new Uint8Array(audioBuffer).set(audio);
    form.set('model', OPENAI_TRANSCRIPTION_MODEL);
    form.set('response_format', 'json');
    form.set(
      'file',
      new Blob([audioBuffer], { type: mimeType || 'audio/ogg' }),
      'voice.ogg',
    );

    try {
      let response: Response;
      try {
        response = await this.request(
          'https://api.openai.com/v1/audio/transcriptions',
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.apiKey}` },
            body: form,
            signal: AbortSignal.timeout(30_000),
          },
        );
      } catch {
        throw transcriptionUnavailable();
      }
      if (!response.ok) throw transcriptionUnavailable();
      const payload = (await response.json()) as { text?: unknown };
      const text = typeof payload.text === 'string' ? payload.text.trim() : '';
      if (!text || text.length > MAX_NOTE_TEXT_LENGTH) {
        throw transcriptionUnavailable();
      }
      return text;
    } catch {
      throw transcriptionUnavailable();
    } finally {
      new Uint8Array(audioBuffer).fill(0);
    }
  }
}
