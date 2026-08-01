import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  generateTelegramLinkCode,
  handleTelegramLinkCode,
  hashTelegramLinkCode,
} from '../_shared/telegram-link-handler.ts';
import {
  createTelegramWebhookHandler,
  secureTelegramSecretMatches,
  telegramClientRequestId,
} from '../_shared/telegram-handler.ts';
import { TelegramApiClient } from '../_shared/telegram-api.ts';
import { OpenAiVoiceTranscriber } from '../_shared/transcription.ts';
import type {
  TelegramDueReview,
  TelegramGateway,
  TelegramKnowledgeService,
  TelegramRepository,
  TelegramSettings,
  TelegramTodayNote,
  VoiceTranscriber,
} from '../_shared/telegram-types.ts';
import type {
  CaptureNoteRequest,
  CaptureNoteResponse,
  SearchNotesRequest,
  SearchNotesResponse,
} from '../_shared/contracts.ts';

const SECRET = 'synthetic_webhook_secret';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CHAT_ID = 700000000001;

class Repository implements TelegramRepository {
  claimed = new Set<number>();
  users = new Map<number, string>();
  consumedCodeResult: string | null = null;
  consumedHashes: string[] = [];
  today: TelegramTodayNote[] = [];
  reviews: TelegramDueReview[] = [];
  profileSettings: TelegramSettings = {
    timezone: 'Asia/Kolkata',
    digestTime: '21:00:00',
    reviewTime: '09:00:00',
  };

  async claimUpdate(updateId: number): Promise<boolean> {
    if (this.claimed.has(updateId)) return false;
    this.claimed.add(updateId);
    return true;
  }

  async userIdForChat(chatId: number): Promise<string | null> {
    return this.users.get(chatId) ?? null;
  }

  async consumeLinkCode(codeHash: string): Promise<string | null> {
    this.consumedHashes.push(codeHash);
    return this.consumedCodeResult;
  }

  async todayNotes(): Promise<TelegramTodayNote[]> {
    return this.today;
  }

  async dueReviews(): Promise<TelegramDueReview[]> {
    return this.reviews;
  }

  async settings(): Promise<TelegramSettings> {
    return this.profileSettings;
  }
}

class Knowledge implements TelegramKnowledgeService {
  captures: Array<{ userId: string; request: CaptureNoteRequest }> = [];
  searches: Array<{ userId: string; request: SearchNotesRequest }> = [];
  captureResponse: CaptureNoteResponse = {
    note: {
      id: NOTE_ID,
      originalText: 'Synthetic stored note.',
      noteType: 'lesson',
      summary: 'Synthetic summary.',
      tags: ['synthetic', 'testing'],
      firstReviewDate: '2026-08-03',
    },
  };
  searchResponse: SearchNotesResponse = {
    answer: 'The stored note supports this answer. [1]',
    citations: [{ number: 1, noteId: NOTE_ID }],
    matches: [
      {
        noteId: NOTE_ID,
        originalText: 'Synthetic stored note.',
        personalContext: null,
        noteType: 'lesson',
        summary: 'Synthetic summary.',
        tags: ['synthetic', 'testing'],
        recallPrompt: 'What does the note support?',
        sourceTitle: null,
        sourceUrl: null,
        capturedAt: '2026-08-02T00:00:00.000Z',
        similarity: 0.9,
      },
    ],
    synthesisWithheld: false,
  };

  async capture(
    userId: string,
    request: CaptureNoteRequest,
  ): Promise<CaptureNoteResponse> {
    this.captures.push({ userId, request });
    return this.captureResponse;
  }

  async search(
    userId: string,
    request: SearchNotesRequest,
  ): Promise<SearchNotesResponse> {
    this.searches.push({ userId, request });
    return this.searchResponse;
  }
}

class Gateway implements TelegramGateway {
  messages: Array<{ chatId: number; text: string }> = [];
  downloads = 0;
  audio = new Uint8Array([7, 8, 9]);

  async sendMessage(chatId: number, text: string): Promise<void> {
    this.messages.push({ chatId, text });
  }

  async downloadVoice(): Promise<Uint8Array> {
    this.downloads += 1;
    return this.audio;
  }
}

class Transcriber implements VoiceTranscriber {
  calls = 0;
  observedAudio: Uint8Array | null = null;

  async transcribe(audio: Uint8Array): Promise<string> {
    this.calls += 1;
    this.observedAudio = audio;
    return 'Synthetic voice transcription.';
  }
}

function update(
  updateId: number,
  message: Record<string, unknown>,
): Record<string, unknown> {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      chat: { id: CHAT_ID, type: 'private' },
      ...message,
    },
  };
}

function webhookRequest(body: unknown, secret = SECRET): Request {
  return new Request('http://localhost/functions/v1/telegram-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': secret,
    },
    body: JSON.stringify(body),
  });
}

function dependencies() {
  const repository = new Repository();
  const knowledge = new Knowledge();
  const telegram = new Gateway();
  const transcriber = new Transcriber();
  const handler = createTelegramWebhookHandler({
    webhookSecret: SECRET,
    repository,
    knowledge,
    telegram,
    transcriber,
  });
  return { repository, knowledge, telegram, transcriber, handler };
}

describe('Telegram link-code generation', () => {
  it('returns a random code while persisting only its SHA-256 hash', async () => {
    let storedHash = '';
    const response = await handleTelegramLinkCode(
      new Request('http://localhost/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      {
        authenticator: {
          async authenticate() {
            return { id: USER_ID };
          },
        },
        repository: {
          async createTelegramLinkCode(codeHash) {
            storedHash = codeHash;
            return {
              expiresAt: '2026-08-02T01:10:00.000Z',
              connected: false,
            };
          },
        },
        randomBytes: (length) => new Uint8Array(length),
      },
    );
    const payload = await response.json();
    assert.equal(payload.code, 'AAAAAAAAAAAA');
    assert.equal(storedHash, await hashTelegramLinkCode(payload.code));
    assert.equal(storedHash.includes(payload.code), false);
  });

  it('rejects a broken entropy source', () => {
    assert.throws(
      () => generateTelegramLinkCode(() => new Uint8Array(1)),
      /invalid length/u,
    );
  });
});

describe('Telegram webhook authorization and replay', () => {
  it('uses a digest comparison for the configured webhook secret', async () => {
    assert.equal(await secureTelegramSecretMatches(SECRET, SECRET), true);
    assert.equal(await secureTelegramSecretMatches(SECRET, 'wrong'), false);
    assert.equal(await secureTelegramSecretMatches(SECRET, null), false);
  });

  it('rejects an invalid secret before claiming the update', async () => {
    const context = dependencies();
    const response = await context.handler(
      webhookRequest(update(1, { text: '/start' }), 'wrong'),
    );
    assert.equal(response.status, 401);
    assert.equal(context.repository.claimed.size, 0);
    assert.equal(context.telegram.messages.length, 0);
  });

  it('acknowledges a replay without repeating any side effect', async () => {
    const context = dependencies();
    context.repository.claimed.add(2);
    const response = await context.handler(
      webhookRequest(update(2, { text: 'Synthetic note.' })),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).replayed, true);
    assert.equal(context.knowledge.captures.length, 0);
    assert.equal(context.telegram.messages.length, 0);
  });
});

describe('Telegram linking and isolation', () => {
  it('implements start without exposing linked-user data', async () => {
    const unlinked = dependencies();
    await unlinked.handler(webhookRequest(update(15, { text: '/start' })));
    assert.match(unlinked.telegram.messages[0].text, /Link this private chat/u);

    const linked = dependencies();
    linked.repository.users.set(CHAT_ID, USER_ID);
    await linked.handler(webhookRequest(update(16, { text: '/start' })));
    assert.match(linked.telegram.messages[0].text, /Novah is linked/u);
    assert.equal(linked.telegram.messages[0].text.includes(USER_ID), false);
  });

  it('links a valid single-use code without exposing its hash', async () => {
    const context = dependencies();
    context.repository.consumedCodeResult = USER_ID;
    const response = await context.handler(
      webhookRequest(update(3, { text: '/link AAAAAAAAAAAA' })),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(context.repository.consumedHashes, [
      await hashTelegramLinkCode('AAAAAAAAAAAA'),
    ]);
    assert.match(context.telegram.messages[0].text, /now linked/u);
    assert.equal(
      context.telegram.messages[0].text.includes(
        context.repository.consumedHashes[0],
      ),
      false,
    );
  });

  it('gives the same safe response for invalid, expired, or used codes', async () => {
    const context = dependencies();
    await context.handler(
      webhookRequest(update(4, { text: '/link AAAAAAAAAAAA' })),
    );
    assert.match(context.telegram.messages[0].text, /invalid, expired/u);
  });

  it('does not let an unlinked chat capture or search', async () => {
    const context = dependencies();
    await context.handler(
      webhookRequest(update(5, { text: '/search another user notes' })),
    );
    await context.handler(
      webhookRequest(update(6, { text: 'Unlinked content.' })),
    );
    await context.handler(webhookRequest(update(14, { text: '/help' })));
    assert.equal(context.knowledge.searches.length, 0);
    assert.equal(context.knowledge.captures.length, 0);
    assert.equal(context.telegram.messages.length, 3);
    assert.equal(
      context.telegram.messages.every(({ text }) =>
        text.includes('Link this private chat'),
      ),
      true,
    );
  });
});

describe('Telegram capture and commands', () => {
  it('routes plain text through user-scoped idempotent capture', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    await context.handler(
      webhookRequest(update(17, { text: 'Synthetic plain text note.' })),
    );
    assert.equal(context.knowledge.captures.length, 1);
    assert.deepEqual(context.knowledge.captures[0], {
      userId: USER_ID,
      request: {
        originalText: 'Synthetic plain text note.',
        captureChannel: 'telegram_text',
        clientRequestId: await telegramClientRequestId(17),
      },
    });
    assert.equal(
      context.telegram.messages[0].text.includes('Synthetic plain text note.'),
      false,
    );
  });

  it('routes forwarded text through user-scoped idempotent capture', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    await context.handler(
      webhookRequest(
        update(7, {
          text: 'Synthetic forwarded note.',
          forward_origin: { type: 'hidden_user', sender_user_name: 'Fixture' },
        }),
      ),
    );
    assert.equal(context.knowledge.captures.length, 1);
    const capture = context.knowledge.captures[0];
    assert.equal(capture.userId, USER_ID);
    assert.equal(capture.request.captureChannel, 'telegram_text');
    assert.equal(capture.request.originalText, 'Synthetic forwarded note.');
    assert.equal(capture.request.sourceTitle, 'Forwarded Telegram message');
    assert.equal(
      capture.request.clientRequestId,
      await telegramClientRequestId(7),
    );
    assert.equal(
      context.telegram.messages[0].text.includes('Synthetic forwarded note.'),
      false,
    );
  });

  it('formats search citations from actual returned note IDs', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    await context.handler(
      webhookRequest(update(8, { text: '/search synthetic lesson' })),
    );
    assert.deepEqual(context.knowledge.searches[0], {
      userId: USER_ID,
      request: { query: 'synthetic lesson', limit: 5 },
    });
    assert.match(context.telegram.messages[0].text, /Sources\n\[1\]/u);
  });

  it('implements today, review, and settings responses', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    context.repository.today = [
      { noteType: 'lesson', summary: 'Synthetic today summary.' },
    ];
    context.repository.reviews = [
      {
        stage: 1,
        recallPrompt: 'What was the synthetic lesson?',
        sourceTitle: 'Fixture source',
      },
    ];
    await context.handler(webhookRequest(update(9, { text: '/today' })));
    await context.handler(webhookRequest(update(10, { text: '/review' })));
    await context.handler(webhookRequest(update(11, { text: '/settings' })));
    assert.match(context.telegram.messages[0].text, /What you kept today/u);
    assert.match(context.telegram.messages[1].text, /Stage 1/u);
    assert.match(context.telegram.messages[2].text, /Asia\/Kolkata/u);
  });
});

describe('Telegram voice handling', () => {
  it('rejects an oversized voice note before download or transcription', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    await context.handler(
      webhookRequest(
        update(12, {
          voice: { file_id: 'fixture-file', duration: 121, file_size: 1 },
        }),
      ),
    );
    assert.equal(context.telegram.downloads, 0);
    assert.equal(context.transcriber.calls, 0);
    assert.equal(context.knowledge.captures.length, 0);
    assert.match(context.telegram.messages[0].text, /two minutes/u);
  });

  it('transcribes, captures, and zeroes downloaded audio immediately', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    const rawAudio = context.telegram.audio;
    await context.handler(
      webhookRequest(
        update(13, {
          voice: {
            file_id: 'fixture-file',
            duration: 30,
            file_size: 3,
            mime_type: 'audio/ogg',
          },
        }),
      ),
    );
    assert.equal(context.transcriber.calls, 1);
    assert.deepEqual(Array.from(rawAudio), [0, 0, 0]);
    assert.equal(
      context.knowledge.captures[0].request.captureChannel,
      'telegram_voice',
    );
    assert.equal(
      context.knowledge.captures[0].request.originalText,
      'Synthetic voice transcription.',
    );
    assert.equal(
      context.telegram.messages[0].text.includes(
        'Synthetic voice transcription.',
      ),
      false,
    );
  });

  it('enforces the downloaded-file size reported by Telegram', async () => {
    let calls = 0;
    const client = new TelegramApiClient('synthetic-token', async () => {
      calls += 1;
      return Response.json({
        ok: true,
        result: { file_path: 'voice/file.oga', file_size: 11 },
      });
    });
    await assert.rejects(
      () => client.downloadVoice('fixture', 10),
      /two minutes/u,
    );
    assert.equal(calls, 1);
  });

  it('stops a voice download when the streamed body crosses the byte limit', async () => {
    let calls = 0;
    const client = new TelegramApiClient('synthetic-token', async () => {
      calls += 1;
      if (calls === 1) {
        return Response.json({
          ok: true,
          result: { file_path: 'voice/file.oga' },
        });
      }
      return new Response(new Uint8Array(11));
    });
    await assert.rejects(
      () => client.downloadVoice('fixture', 10),
      /two minutes/u,
    );
    assert.equal(calls, 2);
  });

  it('uses gpt-transcribe multipart input without a live API call', async () => {
    let observedModel = '';
    let observedFile = false;
    const transcriber = new OpenAiVoiceTranscriber(
      'synthetic-key',
      async (_url, init) => {
        const form = init?.body as FormData;
        observedModel = String(form.get('model'));
        observedFile = form.get('file') instanceof Blob;
        return Response.json({ text: 'Synthetic transcription.' });
      },
    );
    const text = await transcriber.transcribe(
      new Uint8Array([1, 2, 3]),
      'audio/ogg',
    );
    assert.equal(observedModel, 'gpt-transcribe');
    assert.equal(observedFile, true);
    assert.equal(text, 'Synthetic transcription.');
  });
});
