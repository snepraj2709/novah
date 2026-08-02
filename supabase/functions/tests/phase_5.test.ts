import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  dailyDigestSchema,
  type DailyDigest,
} from '../../../packages/shared/src/contracts/index.ts';
import {
  createNotificationHandler,
  processNotifications,
  scheduleWindow,
} from '../_shared/notification-handler.ts';
import type {
  ClaimedReview,
  DigestEvidenceNote,
  DigestGenerator,
  NotificationProfile,
  NotificationRepository,
} from '../_shared/notification-types.ts';
import { reviewCallbackData } from '../_shared/review-callbacks.ts';
import { OpenAiProvider } from '../_shared/openai.ts';
import { createTelegramWebhookHandler } from '../_shared/telegram-handler.ts';
import type {
  TelegramGateway,
  TelegramKnowledgeService,
  TelegramRepository,
  VoiceTranscriber,
} from '../_shared/telegram-types.ts';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EVENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CHAT_ID = 700000000001;
const CRON_SECRET = 'synthetic-cron-secret';

class NotificationStore implements NotificationRepository {
  profileReads = 0;
  profileRows: NotificationProfile[] = [];
  notes: DigestEvidenceNote[] = [];
  reviews: ClaimedReview[] = [];
  digestClaims = new Set<string>();
  reviewClaimed = false;
  persisted: DailyDigest[] = [];
  digestSent: string[] = [];
  reviewSent: string[][] = [];
  digestMarkResult = true;
  reviewMarkCount: number | null = null;

  async profiles(): Promise<NotificationProfile[]> {
    this.profileReads += 1;
    return this.profileRows;
  }

  async digestEvidence(): Promise<DigestEvidenceNote[]> {
    return this.notes;
  }

  async claimDigest(
    _userId: string,
    digestDate: string,
    _noteIds: string[],
    content: DailyDigest,
  ): Promise<string | null> {
    if (this.digestClaims.has(digestDate)) return null;
    this.digestClaims.add(digestDate);
    this.persisted.push(content);
    return 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  }

  async markDigestSent(digestId: string): Promise<boolean> {
    this.digestSent.push(digestId);
    return this.digestMarkResult;
  }

  async claimReviews(): Promise<ClaimedReview[]> {
    if (this.reviewClaimed) return [];
    this.reviewClaimed = true;
    return this.reviews;
  }

  async markReviewsSent(eventIds: string[]): Promise<number> {
    this.reviewSent.push(eventIds);
    return this.reviewMarkCount ?? eventIds.length;
  }
}

class Generator implements DigestGenerator {
  calls = 0;

  async generateDigest(input: {
    captureCount: number;
    sourceCount: number;
    notes: DigestEvidenceNote[];
  }): Promise<DailyDigest> {
    this.calls += 1;
    return {
      captureCount: input.captureCount,
      sourceCount: input.sourceCount,
      themes: [
        {
          title: 'Synthetic theme',
          noteIds: input.notes.slice(0, 2).map((note) => note.noteId),
        },
      ],
      connection: {
        text: 'The notes share a bounded synthetic connection.',
        noteIds: input.notes.map((note) => note.noteId),
      },
      reflectionQuestion: 'What connects these ideas?',
    };
  }
}

class NotificationTelegram {
  messages: Array<{ chatId: number; text: string; options?: unknown }> = [];

  async sendMessage(
    chatId: number,
    text: string,
    options?: unknown,
  ): Promise<void> {
    this.messages.push({ chatId, text, options });
  }
}

function profile(
  overrides: Partial<NotificationProfile> = {},
): NotificationProfile {
  return {
    userId: USER_ID,
    chatId: CHAT_ID,
    timezone: 'Asia/Kolkata',
    digestTime: '21:00:00',
    reviewTime: '09:00:00',
    ...overrides,
  };
}

function note(noteId = NOTE_ID): DigestEvidenceNote {
  return {
    noteId,
    originalText: 'Synthetic original note.',
    personalContext: null,
    summary: 'Synthetic summary.',
    recallPrompt: 'What was the synthetic idea?',
    sourceTitle: 'Synthetic source',
    sourceUrl: null,
  };
}

describe('timezone-aware notification windows', () => {
  it('selects Asia/Kolkata and UTC windows by local time', () => {
    assert.deepEqual(
      scheduleWindow(new Date('2026-08-02T15:35:00.000Z'), profile()),
      {
        localDate: '2026-08-02',
        digestDate: '2026-08-02',
        reviewDate: null,
      },
    );
    assert.equal(
      scheduleWindow(
        new Date('2026-08-02T09:05:00.000Z'),
        profile({ timezone: 'UTC' }),
      ).reviewDate,
      '2026-08-02',
    );
  });

  it('handles a daylight-saving timezone and a midnight-crossing window', () => {
    assert.equal(
      scheduleWindow(
        new Date('2026-11-01T06:05:00.000Z'),
        profile({ timezone: 'America/New_York', digestTime: '01:00:00' }),
      ).digestDate,
      '2026-11-01',
    );
    assert.equal(
      scheduleWindow(
        new Date('2026-08-03T00:02:00.000Z'),
        profile({ timezone: 'UTC', digestTime: '23:55:00' }),
      ).digestDate,
      '2026-08-02',
    );
  });

  it('delivers a nonexistent spring-forward time at the first valid local minute', () => {
    const springForward = profile({
      timezone: 'America/New_York',
      digestTime: '02:30:00',
    });
    assert.equal(
      scheduleWindow(new Date('2026-03-08T07:00:00.000Z'), springForward)
        .digestDate,
      '2026-03-08',
    );
    assert.equal(
      scheduleWindow(new Date('2026-03-08T07:09:00.000Z'), springForward)
        .digestDate,
      '2026-03-08',
    );
    assert.equal(
      scheduleWindow(new Date('2026-03-08T07:10:00.000Z'), springForward)
        .digestDate,
      null,
    );
  });
});

describe('digest and review delivery', () => {
  it('uses a strict stored-false digest request and validates evidence IDs', async () => {
    let requestBody: Record<string, unknown> = {};
    const secondId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const provider = new OpenAiProvider('synthetic-key', async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  captureCount: 2,
                  sourceCount: 1,
                  themes: [
                    {
                      title: 'Synthetic theme',
                      noteIds: [NOTE_ID, secondId],
                    },
                  ],
                  connection: {
                    text: 'A bounded connection.',
                    noteIds: [NOTE_ID, secondId],
                  },
                  reflectionQuestion: 'What connects the two ideas?',
                }),
              },
            ],
          },
        ],
      });
    });
    const digest = await provider.generateDigest({
      captureCount: 2,
      sourceCount: 1,
      notes: [note(), note(secondId)],
    });
    assert.equal(requestBody.store, false);
    assert.equal(
      (requestBody.text as { format: { strict: boolean } }).format.strict,
      true,
    );
    assert.equal(JSON.stringify(requestBody).includes('uniqueItems'), false);
    assert.deepEqual(digest.connection?.noteIds, [NOTE_ID, secondId]);
  });

  it('rejects a recurring theme supported by only one note', () => {
    assert.equal(
      dailyDigestSchema.safeParse({
        captureCount: 2,
        sourceCount: 1,
        themes: [{ title: 'Unsupported recurrence', noteIds: [NOTE_ID] }],
        connection: null,
        reflectionQuestion: 'What connects these ideas?',
      }).success,
      false,
    );
  });

  it('authenticates the Cron request before reading profiles', async () => {
    const repository = new NotificationStore();
    const handler = createNotificationHandler({
      cronSecret: CRON_SECRET,
      repository,
      digestGenerator: new Generator(),
      telegram: new NotificationTelegram(),
    });
    const denied = await handler(
      new Request('http://localhost/process-notifications', { method: 'POST' }),
    );
    assert.equal(denied.status, 401);
    assert.equal(repository.profileReads, 0);
    const probe = await handler(
      new Request('http://localhost/process-notifications', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ probe: true }),
      }),
    );
    assert.equal(probe.status, 200);
    assert.deepEqual(await probe.json(), { ok: true, probe: true });
    assert.equal(repository.profileReads, 0);
    const allowed = await handler(
      new Request('http://localhost/process-notifications', {
        method: 'POST',
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    assert.equal(allowed.status, 200);
    assert.equal(repository.profileReads, 1);
  });

  it('sends nothing for a zero-note local day', async () => {
    const repository = new NotificationStore();
    repository.profileRows = [profile()];
    const telegram = new NotificationTelegram();
    const result = await processNotifications({
      cronSecret: CRON_SECRET,
      repository,
      digestGenerator: new Generator(),
      telegram,
      now: () => new Date('2026-08-02T15:35:00.000Z'),
    });
    assert.equal(result.digestsSent, 0);
    assert.equal(repository.persisted.length, 0);
    assert.equal(telegram.messages.length, 0);
  });

  it('stores and sends a one-note digest without a false theme or connection', async () => {
    const repository = new NotificationStore();
    repository.profileRows = [profile()];
    repository.notes = [note()];
    const generator = new Generator();
    const telegram = new NotificationTelegram();
    await processNotifications({
      cronSecret: CRON_SECRET,
      repository,
      digestGenerator: generator,
      telegram,
      now: () => new Date('2026-08-02T15:35:00.000Z'),
    });
    assert.equal(generator.calls, 0);
    assert.deepEqual(repository.persisted[0].themes, []);
    assert.equal(repository.persisted[0].connection, null);
    assert.doesNotMatch(telegram.messages[0].text, /Recurring theme/u);
  });

  it('uses a grounded deterministic digest when a day is too large for one model request', async () => {
    const repository = new NotificationStore();
    repository.profileRows = [profile()];
    repository.notes = Array.from({ length: 101 }, (_, index) =>
      note(`${String(index + 1).padStart(8, '0')}-0000-4000-8000-000000000000`),
    );
    const generator = new Generator();
    const telegram = new NotificationTelegram();
    const result = await processNotifications({
      cronSecret: CRON_SECRET,
      repository,
      digestGenerator: generator,
      telegram,
      now: () => new Date('2026-08-02T15:35:00.000Z'),
    });

    assert.equal(result.digestsSent, 1);
    assert.equal(generator.calls, 0);
    assert.equal(repository.persisted[0].captureCount, 101);
    assert.deepEqual(repository.persisted[0].themes, []);
    assert.equal(repository.persisted[0].connection, null);
  });

  it('deduplicates repeated and concurrent processors', async () => {
    const repository = new NotificationStore();
    repository.profileRows = [profile()];
    repository.notes = [note(), note('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')];
    const telegram = new NotificationTelegram();
    const dependencies = {
      cronSecret: CRON_SECRET,
      repository,
      digestGenerator: new Generator(),
      telegram,
      now: () => new Date('2026-08-02T15:35:00.000Z'),
    };
    await Promise.all([
      processNotifications(dependencies),
      processNotifications(dependencies),
    ]);
    await processNotifications(dependencies);
    assert.equal(repository.persisted.length, 1);
    assert.equal(repository.digestSent.length, 1);
    assert.equal(telegram.messages.length, 1);
  });

  it('bounds notification work to five profiles at a time', async () => {
    let active = 0;
    let maximumActive = 0;
    let evidenceCalls = 0;
    let releaseEvidence!: () => void;
    const evidenceGate = new Promise<void>((resolve) => {
      releaseEvidence = resolve;
    });
    const repository: NotificationRepository = {
      async profiles() {
        return Array.from({ length: 6 }, (_, index) =>
          profile({ userId: `synthetic-user-${index}` }),
        );
      },
      async digestEvidence() {
        evidenceCalls += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await evidenceGate;
        active -= 1;
        return [];
      },
      async claimDigest() {
        return null;
      },
      async markDigestSent() {
        return false;
      },
      async claimReviews() {
        return [];
      },
      async markReviewsSent() {
        return 0;
      },
    };
    const processing = processNotifications({
      cronSecret: CRON_SECRET,
      repository,
      digestGenerator: new Generator(),
      telegram: new NotificationTelegram(),
      now: () => new Date('2026-08-02T15:35:00.000Z'),
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(evidenceCalls, 5);
    assert.equal(maximumActive, 5);
    releaseEvidence();
    await processing;
    assert.equal(evidenceCalls, 6);
    assert.equal(maximumActive, 5);
  });

  it('groups claimed reviews into one packet with reveal and skip actions', async () => {
    const repository = new NotificationStore();
    repository.profileRows = [
      profile({ digestTime: '21:00:00', reviewTime: '09:00:00' }),
    ];
    repository.reviews = [
      {
        eventId: EVENT_ID,
        noteId: NOTE_ID,
        stage: 1,
        recallPrompt: 'What was the synthetic idea?',
        sourceTitle: 'Synthetic source',
      },
    ];
    const telegram = new NotificationTelegram();
    await Promise.all([
      processNotifications({
        cronSecret: CRON_SECRET,
        repository,
        digestGenerator: new Generator(),
        telegram,
        now: () => new Date('2026-08-02T03:35:00.000Z'),
      }),
      processNotifications({
        cronSecret: CRON_SECRET,
        repository,
        digestGenerator: new Generator(),
        telegram,
        now: () => new Date('2026-08-02T03:35:00.000Z'),
      }),
    ]);
    assert.equal(telegram.messages.length, 1);
    assert.equal(repository.reviewSent.length, 1);
    assert.match(JSON.stringify(telegram.messages[0].options), /Reveal 1/u);
    assert.match(JSON.stringify(telegram.messages[0].options), /Skip 1/u);
  });

  it('does not report delivery when sent-state persistence is incomplete', async () => {
    const repository = new NotificationStore();
    repository.profileRows = [
      profile({ digestTime: '09:00:00', reviewTime: '09:00:00' }),
    ];
    repository.notes = [note()];
    repository.reviews = [
      {
        eventId: EVENT_ID,
        noteId: NOTE_ID,
        stage: 1,
        recallPrompt: 'What was the synthetic idea?',
        sourceTitle: 'Synthetic source',
      },
    ];
    repository.digestMarkResult = false;
    repository.reviewMarkCount = 0;
    const result = await processNotifications({
      cronSecret: CRON_SECRET,
      repository,
      digestGenerator: new Generator(),
      telegram: new NotificationTelegram(),
      now: () => new Date('2026-08-02T03:35:00.000Z'),
    });
    assert.deepEqual(result, {
      profilesChecked: 1,
      digestsSent: 0,
      reviewPacketsSent: 0,
      errors: 2,
    });
  });

  it('marks and counts each review packet independently', async () => {
    const repository = new NotificationStore();
    repository.profileRows = [profile({ reviewTime: '09:00:00' })];
    repository.reviews = Array.from({ length: 9 }, (_, index) => ({
      eventId: `${String(index + 1).padStart(8, '0')}-0000-4000-8000-000000000000`,
      noteId: NOTE_ID,
      stage: (index % 5) + 1,
      recallPrompt: `Synthetic prompt ${index + 1}`,
      sourceTitle: 'Synthetic source',
    }));
    const result = await processNotifications({
      cronSecret: CRON_SECRET,
      repository,
      digestGenerator: new Generator(),
      telegram: new NotificationTelegram(),
      now: () => new Date('2026-08-02T03:35:00.000Z'),
    });
    assert.equal(result.reviewPacketsSent, 2);
    assert.deepEqual(
      repository.reviewSent.map((eventIds) => eventIds.length),
      [8, 1],
    );
  });
});

class CallbackRepository implements TelegramRepository {
  claimed = new Set<number>();
  feedback: Array<{ eventId: string; status: string }> = [];

  async claimUpdate(updateId: number): Promise<boolean> {
    if (this.claimed.has(updateId)) return false;
    this.claimed.add(updateId);
    return true;
  }
  async userIdForChat(): Promise<string | null> {
    return USER_ID;
  }
  async consumeLinkCode(): Promise<string | null> {
    return null;
  }
  async todayNotes() {
    return [];
  }
  async dueReviews() {
    return [];
  }
  async settings() {
    return { timezone: 'UTC', digestTime: '21:00:00', reviewTime: '09:00:00' };
  }
  async revealReview(_userId: string, eventId: string) {
    return eventId === EVENT_ID
      ? {
          originalText: 'Synthetic original note.',
          sourceTitle: 'Synthetic source',
        }
      : null;
  }
  async recordReviewFeedback(
    _userId: string,
    eventId: string,
    status: 'remembered' | 'partial' | 'missed' | 'skipped',
  ) {
    this.feedback.push({ eventId, status });
    return eventId === EVENT_ID;
  }
}

class CallbackGateway implements TelegramGateway {
  messages: string[] = [];
  answers: string[] = [];
  async sendMessage(_chatId: number, text: string): Promise<void> {
    this.messages.push(text);
  }
  async answerCallbackQuery(_id: string, text?: string): Promise<void> {
    this.answers.push(text ?? '');
  }
  async downloadVoice(): Promise<Uint8Array> {
    return new Uint8Array();
  }
}

function callbackUpdate(updateId: number, data: string) {
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

describe('review callbacks', () => {
  it('reveals and records recall quality for the exact event', async () => {
    const repository = new CallbackRepository();
    const telegram = new CallbackGateway();
    const handler = createTelegramWebhookHandler({
      webhookSecret: 'synthetic-webhook-secret',
      repository,
      telegram,
      knowledge: {} as TelegramKnowledgeService,
      transcriber: {} as VoiceTranscriber,
    });
    const request = (body: unknown) =>
      new Request('http://localhost/telegram-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'synthetic-webhook-secret',
        },
        body: JSON.stringify(body),
      });
    await handler(
      request(callbackUpdate(1, reviewCallbackData(EVENT_ID, 'reveal'))),
    );
    await handler(
      request(callbackUpdate(2, reviewCallbackData(EVENT_ID, 'partial'))),
    );
    assert.match(telegram.messages[0], /Synthetic original note/u);
    assert.deepEqual(repository.feedback, [
      { eventId: EVENT_ID, status: 'partial' },
    ]);
    assert.match(telegram.answers[1], /recorded/u);
  });
});
