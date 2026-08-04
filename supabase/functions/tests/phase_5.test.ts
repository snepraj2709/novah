import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  checkInMessage,
  createNotificationHandler,
  practiceCallbackData,
  practiceMessage,
  processNotifications,
  scheduleWindow,
} from '../_shared/notification-handler.ts';
import { MAX_TELEGRAM_MESSAGE_LENGTH } from '../../../packages/shared/src/constants/index.ts';
import { splitTelegramMessage } from '../_shared/telegram-message.ts';
import type {
  ClaimedCheckIn,
  ClaimedPractice,
  ClaimedReadyPractice,
  NotificationProfile,
  NotificationRepository,
} from '../_shared/notification-types.ts';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CHAT_ID = 700000000001;
const SECRET = 'synthetic-cron-secret';

class Repository implements NotificationRepository {
  profileReads = 0;
  profileRows: NotificationProfile[] = [];
  practices: ClaimedPractice[] = [];
  readyPractices: ClaimedReadyPractice[] = [];
  checkIns: ClaimedCheckIn[] = [];
  claimedDays = new Set<string>();
  readyClaimed = false;
  checkInsClaimed = false;
  marks: Array<{ noteId: string; localDate: string }> = [];
  readyMarks: Array<{ noteId: string; localDate: string; claimedAt: string }> =
    [];
  checkInMarks: Array<{
    noteIds: string[];
    localDate: string;
    claimedAt: string;
  }> = [];
  reconciliations: Array<{ userId: string; localDate: string }> = [];
  markResult = true;

  async profiles() {
    this.profileReads += 1;
    return this.profileRows;
  }
  async reconcileDuePauses(userId: string, localDate: string) {
    this.reconciliations.push({ userId, localDate });
  }
  async claimDuePractices(
    _userId: string,
    localDate: string,
  ): Promise<ClaimedPractice[]> {
    if (this.claimedDays.has(localDate)) return [];
    this.claimedDays.add(localDate);
    return this.practices;
  }
  async markPracticeSent(
    _userId: string,
    noteId: string,
    localDate: string,
  ): Promise<boolean> {
    this.marks.push({ noteId, localDate });
    return this.markResult;
  }
  async claimReadyPractices(): Promise<ClaimedReadyPractice[]> {
    if (this.readyClaimed) return [];
    this.readyClaimed = true;
    return this.readyPractices;
  }
  async markReadyPracticeSent(
    _userId: string,
    noteId: string,
    localDate: string,
    claimedAt: string,
  ): Promise<boolean> {
    this.readyMarks.push({ noteId, localDate, claimedAt });
    return this.markResult;
  }
  async claimDueCheckIns(): Promise<ClaimedCheckIn[]> {
    if (this.checkInsClaimed) return [];
    this.checkInsClaimed = true;
    return this.checkIns;
  }
  async markCheckInsSent(
    _userId: string,
    noteIds: string[],
    localDate: string,
    claimedAt: string,
  ): Promise<boolean> {
    this.checkInMarks.push({ noteIds, localDate, claimedAt });
    return this.markResult;
  }
}

class Telegram {
  messages: Array<{ chatId: number; text: string; options?: unknown }> = [];
  fail = false;
  async sendMessage(chatId: number, text: string, options?: unknown) {
    if (this.fail) throw new Error('synthetic Telegram failure');
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
    practiceTime: '09:00:00',
    ...overrides,
  };
}

function practice(noteId = NOTE_ID): ClaimedPractice {
  return {
    noteId,
    originalText: 'Exact synthetic original.',
    sourceTitle: 'Synthetic source',
    nextDueOn: '2026-08-03',
  };
}

describe('Practice notification scheduling', () => {
  it('splits Telegram text without losing Unicode content', () => {
    const exact = `${'a'.repeat(MAX_TELEGRAM_MESSAGE_LENGTH - 1)}🙂${'z'.repeat(20)}`;
    const parts = splitTelegramMessage(exact);
    assert.equal(parts.join(''), exact);
    assert.ok(parts.length > 1);
    assert.ok(
      parts.every((part) => part.length <= MAX_TELEGRAM_MESSAGE_LENGTH),
    );
    assert.equal(parts[0].endsWith('\ud83d'), false);
    assert.equal(parts[1].startsWith('\ude42'), false);
  });

  it('uses the account timezone and ten-minute Practice window', () => {
    assert.deepEqual(
      scheduleWindow(new Date('2026-08-03T03:35:00.000Z'), profile()),
      { localDate: '2026-08-03', practiceDate: '2026-08-03' },
    );
    assert.equal(
      scheduleWindow(new Date('2026-08-03T03:50:00.000Z'), profile())
        .practiceDate,
      null,
    );
    assert.equal(
      scheduleWindow(
        new Date('2026-08-03T09:05:00.000Z'),
        profile({ timezone: 'UTC' }),
      ).practiceDate,
      '2026-08-03',
    );
  });

  it('delivers a nonexistent spring-forward Practice time at the first valid minute', () => {
    assert.equal(
      scheduleWindow(
        new Date('2026-03-08T07:00:00.000Z'),
        profile({
          timezone: 'America/New_York',
          practiceTime: '02:30:00',
        }),
      ).practiceDate,
      '2026-03-08',
    );
  });

  it('sends due practices separately with exact notes and reread callbacks', async () => {
    const repository = new Repository();
    repository.profileRows = [profile()];
    repository.practices = [
      practice(),
      practice('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    ];
    const telegram = new Telegram();
    const result = await processNotifications({
      cronSecret: SECRET,
      repository,
      telegram,
      now: () => new Date('2026-08-03T03:35:00.000Z'),
    });
    assert.deepEqual(result, {
      practicesSent: 2,
      readySent: 0,
      checkInPacketsSent: 0,
      errors: 0,
    });
    assert.equal(telegram.messages.length, 2);
    assert.match(telegram.messages[0].text, /Exact synthetic original/u);
    const options = telegram.messages[0].options as {
      inlineKeyboard: Array<Array<{ callbackData: string }>>;
    };
    assert.equal(options.inlineKeyboard[0][0].callbackData, `p:r:${NOTE_ID}`);
    assert.equal(options.inlineKeyboard[1][0].callbackData, `p:e:r:${NOTE_ID}`);
    assert.equal(options.inlineKeyboard[1][1].callbackData, `p:e:s:${NOTE_ID}`);
    assert.equal(options.inlineKeyboard[2][0].callbackData, `p:p:${NOTE_ID}`);
    assert.equal(options.inlineKeyboard[2][1].callbackData, `p:i:${NOTE_ID}`);
    assert.equal(options.inlineKeyboard[3][0].callbackData, `p:n:${NOTE_ID}`);
    assert.ok(practiceCallbackData(NOTE_ID).length <= 64);
  });

  it('delivers an over-limit Practice exactly and adds actions only to its final part', async () => {
    const repository = new Repository();
    repository.profileRows = [profile()];
    const claimed = {
      ...practice(),
      originalText: `opening🙂${'x'.repeat(9_000)}closing`,
    };
    repository.practices = [claimed];
    const telegram = new Telegram();
    const result = await processNotifications({
      cronSecret: SECRET,
      repository,
      telegram,
      now: () => new Date('2026-08-03T03:35:00.000Z'),
    });
    assert.equal(result.practicesSent, 1);
    assert.ok(telegram.messages.length > 1);
    assert.ok(
      telegram.messages.every(
        (message) => message.text.length <= MAX_TELEGRAM_MESSAGE_LENGTH,
      ),
    );
    assert.equal(
      telegram.messages.map((message) => message.text).join(''),
      practiceMessage(claimed),
    );
    assert.ok(
      telegram.messages.slice(0, -1).every((message) => !message.options),
    );
    assert.ok(telegram.messages.at(-1)?.options);
    assert.equal(repository.marks.length, 1);
  });

  it('deduplicates repeated and concurrent runs for the same local day', async () => {
    const repository = new Repository();
    repository.profileRows = [profile()];
    repository.practices = [practice()];
    const telegram = new Telegram();
    const dependencies = {
      cronSecret: SECRET,
      repository,
      telegram,
      now: () => new Date('2026-08-03T03:35:00.000Z'),
    };
    await Promise.all([
      processNotifications(dependencies),
      processNotifications(dependencies),
    ]);
    await processNotifications(dependencies);
    assert.equal(telegram.messages.length, 1);
    assert.equal(repository.marks.length, 1);
  });

  it('allows a still-due practice to be claimed on the next local day', async () => {
    const repository = new Repository();
    repository.profileRows = [profile()];
    repository.practices = [practice()];
    const telegram = new Telegram();
    await processNotifications({
      cronSecret: SECRET,
      repository,
      telegram,
      now: () => new Date('2026-08-03T03:35:00.000Z'),
    });
    await processNotifications({
      cronSecret: SECRET,
      repository,
      telegram,
      now: () => new Date('2026-08-04T03:35:00.000Z'),
    });
    assert.deepEqual(
      repository.marks.map((mark) => mark.localDate),
      ['2026-08-03', '2026-08-04'],
    );
  });

  it('does not mark a failed Telegram send as delivered', async () => {
    const repository = new Repository();
    repository.profileRows = [profile()];
    repository.practices = [practice()];
    const telegram = new Telegram();
    telegram.fail = true;
    const result = await processNotifications({
      cronSecret: SECRET,
      repository,
      telegram,
      now: () => new Date('2026-08-03T03:35:00.000Z'),
    });
    assert.deepEqual(result, {
      practicesSent: 0,
      readySent: 0,
      checkInPacketsSent: 0,
      errors: 1,
    });
    assert.equal(repository.marks.length, 0);
  });

  it('reconciles unlinked profiles without attempting Telegram delivery', async () => {
    const repository = new Repository();
    repository.profileRows = [profile({ chatId: null })];
    repository.practices = [practice()];
    const telegram = new Telegram();
    const result = await processNotifications({
      cronSecret: SECRET,
      repository,
      telegram,
      now: () => new Date('2026-08-03T03:35:00.000Z'),
    });
    assert.deepEqual(repository.reconciliations, [
      { userId: USER_ID, localDate: '2026-08-03' },
    ]);
    assert.equal(telegram.messages.length, 0);
    assert.equal(result.errors, 0);
  });

  it('reconciles pauses with the current local date across a prior-day delivery window', async () => {
    const repository = new Repository();
    repository.profileRows = [
      profile({ chatId: null, timezone: 'UTC', practiceTime: '23:59:00' }),
    ];
    const result = await processNotifications({
      cronSecret: SECRET,
      repository,
      telegram: new Telegram(),
      now: () => new Date('2026-08-04T00:05:00.000Z'),
    });
    assert.deepEqual(repository.reconciliations, [
      { userId: USER_ID, localDate: '2026-08-04' },
    ]);
    assert.equal(result.errors, 0);
  });

  it('sends ready-to-resume once and groups all due check-ins into one packet', async () => {
    const repository = new Repository();
    repository.profileRows = [profile()];
    repository.readyPractices = [
      {
        noteId: NOTE_ID,
        originalText: 'Ready exact original.',
        sourceTitle: null,
      },
    ];
    repository.checkIns = [
      {
        noteId: NOTE_ID,
        originalText: 'First integrated note.',
        sourceTitle: null,
        nextCheckInOn: '2026-08-03',
      },
      {
        noteId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        originalText: 'Second integrated note.',
        sourceTitle: 'Source',
        nextCheckInOn: '2026-08-03',
      },
    ];
    const telegram = new Telegram();
    const dependencies = {
      cronSecret: SECRET,
      repository,
      telegram,
      now: () => new Date('2026-08-03T03:35:00.000Z'),
    };
    const first = await processNotifications(dependencies);
    const second = await processNotifications(dependencies);
    assert.deepEqual(first, {
      practicesSent: 0,
      readySent: 1,
      checkInPacketsSent: 1,
      errors: 0,
    });
    assert.deepEqual(second, {
      practicesSent: 0,
      readySent: 0,
      checkInPacketsSent: 0,
      errors: 0,
    });
    assert.equal(telegram.messages.length, 2);
    assert.match(telegram.messages[0].text, /Ready exact original/u);
    assert.match(telegram.messages[1].text, /First integrated note/u);
    assert.match(telegram.messages[1].text, /Second integrated note/u);
    const readyOptions = telegram.messages[0].options as {
      inlineKeyboard: Array<Array<{ callbackData: string }>>;
    };
    assert.equal(
      readyOptions.inlineKeyboard[0][0].callbackData,
      `p:u:${NOTE_ID}`,
    );
    const checkInOptions = telegram.messages[1].options as {
      inlineKeyboard: Array<Array<{ callbackData: string }>>;
    };
    assert.equal(
      checkInOptions.inlineKeyboard[0][0].callbackData,
      `p:c:${NOTE_ID}`,
    );
    assert.equal(
      checkInOptions.inlineKeyboard[1][0].callbackData,
      `p:u:${NOTE_ID}`,
    );
    assert.equal(
      checkInOptions.inlineKeyboard[1][1].callbackData,
      `p:x:${NOTE_ID}`,
    );
    assert.equal(repository.checkInMarks.length, 1);
  });

  it('delivers an over-limit check-in packet exactly and marks it only after the final part', async () => {
    const repository = new Repository();
    repository.profileRows = [profile()];
    repository.checkIns = [
      {
        noteId: NOTE_ID,
        originalText: `first🙂${'y'.repeat(9_000)}last`,
        sourceTitle: 'Exact source',
        nextCheckInOn: '2026-08-03',
      },
    ];
    const telegram = new Telegram();
    const result = await processNotifications({
      cronSecret: SECRET,
      repository,
      telegram,
      now: () => new Date('2026-08-03T03:35:00.000Z'),
    });
    assert.equal(result.checkInPacketsSent, 1);
    assert.ok(telegram.messages.length > 1);
    assert.ok(
      telegram.messages.every(
        (message) => message.text.length <= MAX_TELEGRAM_MESSAGE_LENGTH,
      ),
    );
    assert.equal(
      telegram.messages.map((message) => message.text).join(''),
      checkInMessage(repository.checkIns),
    );
    assert.ok(
      telegram.messages.slice(0, -1).every((message) => !message.options),
    );
    assert.ok(telegram.messages.at(-1)?.options);
    assert.deepEqual(repository.checkInMarks[0].noteIds, [NOTE_ID]);
  });

  it('bounds large check-in sets into independently marked logical packets', async () => {
    const repository = new Repository();
    repository.profileRows = [profile()];
    repository.checkIns = Array.from({ length: 21 }, (_, index) => ({
      noteId: `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`,
      originalText: `Integrated note ${index + 1}.`,
      sourceTitle: null,
      nextCheckInOn: '2026-08-03',
    }));
    const telegram = new Telegram();
    const result = await processNotifications({
      cronSecret: SECRET,
      repository,
      telegram,
      now: () => new Date('2026-08-03T03:35:00.000Z'),
    });
    assert.equal(result.checkInPacketsSent, 2);
    assert.equal(repository.checkInMarks.length, 2);
    assert.equal(repository.checkInMarks[0].noteIds.length, 20);
    assert.equal(repository.checkInMarks[1].noteIds.length, 1);
    assert.match(telegram.messages[1].text, /21\. Integrated note 21/u);
  });
});

describe('Practice notification endpoint', () => {
  it('authenticates before profile reads and supports a side-effect-free probe', async () => {
    const repository = new Repository();
    const handler = createNotificationHandler({
      cronSecret: SECRET,
      repository,
      telegram: new Telegram(),
    });
    assert.equal(
      (
        await handler(
          new Request('http://localhost/process', { method: 'POST' }),
        )
      ).status,
      401,
    );
    assert.equal(repository.profileReads, 0);
    const probe = await handler(
      new Request('http://localhost/process', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ probe: true }),
      }),
    );
    assert.deepEqual(await probe.json(), { ok: true, probe: true });
    assert.equal(repository.profileReads, 0);
  });

  it('does not construct a text-model provider or call a digest generator', async () => {
    const [worker, openai] = await Promise.all([
      readFile(
        new URL('../process-notifications/index.ts', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../_shared/openai.ts', import.meta.url), 'utf8'),
    ]);

    assert.doesNotMatch(worker, /OpenAi|OpenAI|OPENAI_API_KEY|generateDigest/u);
    assert.doesNotMatch(openai, /generateDigest|dailyDigestSchema/u);
  });
});
