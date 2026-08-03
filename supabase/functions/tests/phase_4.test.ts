import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createTelegramWebhookHandler,
  telegramClientRequestId,
} from '../_shared/telegram-handler.ts';
import {
  MAX_TELEGRAM_VOICE_BYTES,
  MAX_TELEGRAM_VOICE_DURATION_SECONDS,
} from '../../../packages/shared/src/constants/index.ts';
import type {
  CaptureNoteRequest,
  CaptureNoteResponse,
  SearchNotesRequest,
  SearchNotesResponse,
} from '../_shared/contracts.ts';
import { ApiError } from '../_shared/errors.ts';
import type {
  TelegramGateway,
  TelegramKnowledgeService,
  TelegramPractice,
  TelegramPracticeEntryIntent,
  TelegramPracticeEntrySource,
  TelegramRepository,
  TelegramSettings,
  VoiceTranscriber,
} from '../_shared/telegram-types.ts';

const SECRET = 'synthetic_webhook_secret';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CHAT_ID = 700000000001;

class Repository implements TelegramRepository {
  claimed = new Set<number>();
  users = new Map<number, string>();
  practicesRows: TelegramPractice[] = [];
  mutations: Array<{ userId: string; action: string; noteId: string }> = [];
  prompts: Array<{
    userId: string;
    chatId: number;
    promptMessageId: number;
    noteId: string;
    intent: TelegramPracticeEntryIntent;
  }> = [];
  inspections: number[] = [];
  replies: Array<{
    promptMessageId: number;
    text: string;
    sourceChannel: TelegramPracticeEntrySource;
  }> = [];
  replyIntent: TelegramPracticeEntryIntent = 'reflection';
  expiredPrompts = new Set<number>();

  async claimUpdate(updateId: number): Promise<boolean> {
    if (this.claimed.has(updateId)) return false;
    this.claimed.add(updateId);
    return true;
  }
  async userIdForChat(chatId: number): Promise<string | null> {
    return this.users.get(chatId) ?? null;
  }
  async consumeLinkCode(): Promise<string | null> {
    return null;
  }
  async practices(): Promise<TelegramPractice[]> {
    return this.practicesRows;
  }
  async settings(): Promise<TelegramSettings> {
    return { timezone: 'Asia/Kolkata', practiceTime: '09:00:00' };
  }
  async managePractice(
    userId: string,
    action: 'activate' | 'reread',
    noteId: string,
  ): Promise<void> {
    this.mutations.push({ userId, action, noteId });
  }
  async createReplyPrompt(
    userId: string,
    chatId: number,
    promptMessageId: number,
    noteId: string,
    intent: TelegramPracticeEntryIntent,
  ) {
    this.prompts.push({ userId, chatId, promptMessageId, noteId, intent });
  }
  async inspectReplyPrompt(
    _userId: string,
    _chatId: number,
    promptMessageId: number,
  ) {
    this.inspections.push(promptMessageId);
    if (this.expiredPrompts.has(promptMessageId)) {
      throw new ApiError(409, 'reply_expired', 'Synthetic expiry.');
    }
    return this.replyIntent;
  }
  async consumePracticeReply(
    _userId: string,
    _chatId: number,
    promptMessageId: number,
    text: string,
    sourceChannel: TelegramPracticeEntrySource,
  ) {
    if (this.expiredPrompts.has(promptMessageId)) {
      throw new ApiError(409, 'reply_expired', 'Synthetic expiry.');
    }
    this.replies.push({ promptMessageId, text, sourceChannel });
    return this.replyIntent;
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
        sourceTitle: null,
        sourceUrl: null,
        capturedAt: '2026-08-02T00:00:00.000Z',
        similarity: 0.9,
      },
    ],
    synthesisWithheld: false,
  };
  async capture(userId: string, request: CaptureNoteRequest) {
    this.captures.push({ userId, request });
    return this.captureResponse;
  }
  async search(userId: string, request: SearchNotesRequest) {
    this.searches.push({ userId, request });
    return this.searchResponse;
  }
}

class Gateway implements TelegramGateway {
  messages: Array<{ chatId: number; text: string; options?: unknown }> = [];
  answers: Array<{ id: string; text?: string }> = [];
  audio = new Uint8Array([7, 8, 9]);
  downloads = 0;
  forceReplies: Array<{ chatId: number; text: string }> = [];
  nextPromptMessageId = 9901;
  async sendMessage(chatId: number, text: string, options?: unknown) {
    this.messages.push({ chatId, text, options });
  }
  async sendForceReply(chatId: number, text: string): Promise<number> {
    this.forceReplies.push({ chatId, text });
    return this.nextPromptMessageId;
  }
  async answerCallbackQuery(id: string, text?: string) {
    this.answers.push({ id, ...(text ? { text } : {}) });
  }
  async downloadVoice(): Promise<Uint8Array> {
    this.downloads += 1;
    return this.audio;
  }
}

class Transcriber implements VoiceTranscriber {
  calls = 0;
  async transcribe(): Promise<string> {
    this.calls += 1;
    return 'Transcribed voice note.';
  }
}

function update(updateId: number, message: Record<string, unknown>) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      chat: { id: CHAT_ID, type: 'private' },
      ...message,
    },
  };
}

function callback(updateId: number, data: string) {
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
      data,
      message: {
        message_id: updateId,
        chat: { id: CHAT_ID, type: 'private' },
      },
    },
  };
}

function request(body: unknown, secret = SECRET): Request {
  return new Request('http://localhost/telegram-webhook', {
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

describe('Telegram Practice cutover', () => {
  it('authenticates before claiming an update and deduplicates replays', async () => {
    const context = dependencies();
    assert.equal(
      (await context.handler(request(update(1, { text: '/help' }), 'wrong')))
        .status,
      401,
    );
    context.repository.users.set(CHAT_ID, USER_ID);
    await context.handler(request(update(2, { text: '/help' })));
    const replay = await context.handler(request(update(2, { text: '/help' })));
    assert.deepEqual(await replay.json(), { ok: true, replayed: true });
    assert.equal(context.telegram.messages.length, 1);
  });

  it('supports /find and retires /search to current help', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    await context.handler(
      request(update(3, { text: '/find synthetic lesson' })),
    );
    await context.handler(
      request(update(4, { text: '/search synthetic lesson' })),
    );
    assert.deepEqual(context.knowledge.searches[0], {
      userId: USER_ID,
      request: { query: 'synthetic lesson', limit: 5 },
    });
    assert.equal(context.knowledge.searches.length, 1);
    assert.match(context.telegram.messages[1].text, /\/find QUERY/u);
  });

  it('sends each active Practice separately with bounded callbacks', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    context.repository.practicesRows = [
      {
        noteId: NOTE_ID,
        originalText: 'Exact original note.',
        sourceTitle: 'Source',
        nextDueOn: '2026-08-04',
      },
      {
        noteId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        originalText: 'Second exact note.',
        sourceTitle: null,
        nextDueOn: '2026-08-05',
      },
    ];
    await context.handler(request(update(5, { text: '/practice' })));
    assert.equal(context.telegram.messages.length, 2);
    assert.match(context.telegram.messages[0].text, /Exact original note/u);
    const options = context.telegram.messages[0].options as {
      inlineKeyboard: Array<Array<{ callbackData: string }>>;
    };
    assert.equal(options.inlineKeyboard[0][0].callbackData, `p:r:${NOTE_ID}`);
    assert.ok(options.inlineKeyboard[0][0].callbackData.length <= 64);
    assert.equal(options.inlineKeyboard[1][0].callbackData, `p:e:r:${NOTE_ID}`);
    assert.equal(options.inlineKeyboard[1][1].callbackData, `p:e:s:${NOTE_ID}`);
    assert.ok(options.inlineKeyboard[1][1].callbackData.length <= 64);
  });

  it('routes a Practice reread callback through the owner-scoped service mutation', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    await context.handler(request(callback(6, `p:r:${NOTE_ID}`)));
    assert.deepEqual(context.repository.mutations, [
      { userId: USER_ID, action: 'reread', noteId: NOTE_ID },
    ]);
    assert.match(context.telegram.answers[0].text ?? '', /Reread recorded/u);
  });

  it('opens and stores a ForceReply prompt for Reflection or Story', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    await context.handler(request(callback(60, `p:e:s:${NOTE_ID}`)));
    assert.match(context.telegram.forceReplies[0].text, /Story/u);
    assert.deepEqual(context.repository.prompts, [
      {
        userId: USER_ID,
        chatId: CHAT_ID,
        promptMessageId: 9901,
        noteId: NOTE_ID,
        intent: 'story',
      },
    ]);
    assert.match(
      context.telegram.answers[0].text ?? '',
      /Story prompt opened/u,
    );
  });

  it('routes a text reply to the stored prompt instead of capture', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    context.repository.replyIntent = 'story';
    await context.handler(
      request(
        update(61, {
          text: 'A story from today.',
          reply_to_message: { message_id: 9901 },
        }),
      ),
    );
    assert.deepEqual(context.repository.replies, [
      {
        promptMessageId: 9901,
        text: 'A story from today.',
        sourceChannel: 'telegram_text',
      },
    ]);
    assert.equal(context.knowledge.captures.length, 0);
    assert.match(context.telegram.messages[0].text, /Saved Story/u);
  });

  it('reports an expired text reply and never converts it into capture', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    context.repository.expiredPrompts.add(9902);
    await context.handler(
      request(
        update(62, {
          text: 'Too late.',
          reply_to_message: { message_id: 9902 },
        }),
      ),
    );
    assert.equal(context.repository.replies.length, 0);
    assert.equal(context.knowledge.captures.length, 0);
    assert.match(context.telegram.messages[0].text, /expired/u);
  });

  it('validates a voice reply before transcription, consumes it, and clears audio', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    context.repository.replyIntent = 'reflection';
    const raw = context.telegram.audio;
    await context.handler(
      request(
        update(63, {
          reply_to_message: { message_id: 9903 },
          voice: { file_id: 'voice-reply', duration: 30, file_size: 3 },
        }),
      ),
    );
    assert.deepEqual(context.repository.inspections, [9903]);
    assert.equal(context.transcriber.calls, 1);
    assert.deepEqual(context.repository.replies, [
      {
        promptMessageId: 9903,
        text: 'Transcribed voice note.',
        sourceChannel: 'telegram_voice',
      },
    ]);
    assert.equal(context.knowledge.captures.length, 0);
    assert.deepEqual([...raw], [0, 0, 0]);
  });

  it('does not download or transcribe an expired voice reply', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    context.repository.expiredPrompts.add(9904);
    await context.handler(
      request(
        update(64, {
          reply_to_message: { message_id: 9904 },
          voice: { file_id: 'expired-voice', duration: 30, file_size: 3 },
        }),
      ),
    );
    assert.deepEqual(context.repository.inspections, [9904]);
    assert.equal(context.telegram.downloads, 0);
    assert.equal(context.transcriber.calls, 0);
    assert.equal(context.knowledge.captures.length, 0);
    assert.match(context.telegram.messages[0].text, /expired/u);
  });

  it('rejects over-duration and over-size voice replies before download', async () => {
    for (const voice of [
      {
        file_id: 'long-voice',
        duration: MAX_TELEGRAM_VOICE_DURATION_SECONDS + 1,
        file_size: 3,
      },
      {
        file_id: 'large-voice',
        duration: 30,
        file_size: MAX_TELEGRAM_VOICE_BYTES + 1,
      },
    ]) {
      const context = dependencies();
      context.repository.users.set(CHAT_ID, USER_ID);
      await context.handler(
        request(
          update(65 + context.telegram.messages.length, {
            reply_to_message: { message_id: 9905 },
            voice,
          }),
        ),
      );
      assert.deepEqual(context.repository.inspections, [9905]);
      assert.equal(context.telegram.downloads, 0);
      assert.equal(context.transcriber.calls, 0);
      assert.equal(context.repository.replies.length, 0);
      assert.match(context.telegram.messages[0].text, /two minutes/u);
    }
  });

  it('reports timezone and Practice time only', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    await context.handler(request(update(7, { text: '/settings' })));
    assert.match(context.telegram.messages[0].text, /Practice time: 09:00/u);
    assert.doesNotMatch(context.telegram.messages[0].text, /digest|review/iu);
  });

  it('keeps ordinary text capture unchanged and without a review date', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    await context.handler(request(update(8, { text: 'Synthetic note.' })));
    assert.deepEqual(context.knowledge.captures[0], {
      userId: USER_ID,
      request: {
        originalText: 'Synthetic note.',
        captureChannel: 'telegram_text',
        clientRequestId: await telegramClientRequestId(8),
      },
    });
    assert.equal(
      'firstReviewDate' in context.knowledge.captureResponse.note,
      false,
    );
  });

  it('transcribes voice, captures it, and clears the raw buffer', async () => {
    const context = dependencies();
    context.repository.users.set(CHAT_ID, USER_ID);
    const raw = context.telegram.audio;
    await context.handler(
      request(
        update(9, {
          voice: { file_id: 'voice', duration: 30, file_size: 3 },
        }),
      ),
    );
    assert.equal(context.transcriber.calls, 1);
    assert.equal(
      context.knowledge.captures[0].request.originalText,
      'Transcribed voice note.',
    );
    assert.deepEqual([...raw], [0, 0, 0]);
  });
});
