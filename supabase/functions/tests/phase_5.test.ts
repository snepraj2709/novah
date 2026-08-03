import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createNotificationHandler,
  practiceCallbackData,
  processNotifications,
  scheduleWindow,
} from '../_shared/notification-handler.ts';
import type {
  ClaimedPractice,
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
  claimedDays = new Set<string>();
  marks: Array<{ noteId: string; localDate: string }> = [];
  markResult = true;

  async profiles() {
    this.profileReads += 1;
    return this.profileRows;
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
    assert.deepEqual(result, { practicesSent: 2, errors: 0 });
    assert.equal(telegram.messages.length, 2);
    assert.match(telegram.messages[0].text, /Exact synthetic original/u);
    const options = telegram.messages[0].options as {
      inlineKeyboard: Array<Array<{ callbackData: string }>>;
    };
    assert.equal(options.inlineKeyboard[0][0].callbackData, `p:r:${NOTE_ID}`);
    assert.ok(practiceCallbackData(NOTE_ID).length <= 64);
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
    assert.deepEqual(result, { practicesSent: 0, errors: 1 });
    assert.equal(repository.marks.length, 0);
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
});
