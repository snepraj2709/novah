import { MAX_TELEGRAM_MESSAGE_LENGTH } from '../../../packages/shared/src/constants/index.ts';
import { ApiError, errorResponse } from './errors.ts';
import { parseOptionalJson } from './http.ts';
import type {
  ClaimedCheckIn,
  ClaimedPractice,
  ClaimedReadyPractice,
  NotificationProfile,
  NotificationRepository,
  NotificationTelegramGateway,
} from './notification-types.ts';
import { secureTelegramSecretMatches } from './telegram-handler.ts';

const WINDOW_MINUTES = 10;
const PROFILE_CONCURRENCY = 5;

export interface NotificationProcessorDependencies {
  cronSecret: string;
  repository: NotificationRepository;
  telegram: NotificationTelegramGateway;
  now?: () => Date;
}

export interface ScheduleWindow {
  localDate: string;
  practiceDate: string | null;
}

interface LocalParts {
  date: string;
  minuteOfDay: number;
  ordinalMinute: number;
}

function localParts(now: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => {
    const found = parts.find((part) => part.type === type)?.value;
    if (!found) throw new Error('Timezone conversion failed');
    return found;
  };
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minuteOfDay: Number(value('hour')) * 60 + Number(value('minute')),
    ordinalMinute:
      Date.UTC(
        Number(value('year')),
        Number(value('month')) - 1,
        Number(value('day')),
        Number(value('hour')),
        Number(value('minute')),
      ) / 60_000,
  };
}

function previousDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function scheduleWindow(
  now: Date,
  profile: Pick<NotificationProfile, 'timezone' | 'practiceTime'>,
): ScheduleWindow {
  const local = localParts(now, profile.timezone);
  const [hour, minute] = profile.practiceTime.split(':').map(Number);
  const scheduledMinute = hour * 60 + minute;
  const elapsed = (local.minuteOfDay - scheduledMinute + 1_440) % 1_440;
  let practiceDate =
    elapsed >= WINDOW_MINUTES
      ? null
      : local.minuteOfDay < scheduledMinute
        ? previousDate(local.date)
        : local.date;
  if (!practiceDate) {
    const instantMinute = Math.floor(now.getTime() / 60_000);
    const beforeWindow = localParts(
      new Date((instantMinute - WINDOW_MINUTES) * 60_000),
      profile.timezone,
    );
    if (local.ordinalMinute - beforeWindow.ordinalMinute > WINDOW_MINUTES) {
      for (let offset = 0; offset < WINDOW_MINUTES; offset += 1) {
        const after = localParts(
          new Date((instantMinute - offset) * 60_000),
          profile.timezone,
        );
        const before = localParts(
          new Date((instantMinute - offset - 1) * 60_000),
          profile.timezone,
        );
        const [year, month, day] = after.date.split('-').map(Number);
        const scheduledOrdinal =
          Date.UTC(year, month - 1, day, hour, minute) / 60_000;
        if (
          after.ordinalMinute - before.ordinalMinute > 1 &&
          scheduledOrdinal > before.ordinalMinute &&
          scheduledOrdinal < after.ordinalMinute
        ) {
          practiceDate = after.date;
          break;
        }
      }
    }
  }
  return { localDate: local.date, practiceDate };
}

export function practiceCallbackData(noteId: string): string {
  return `p:r:${noteId}`;
}

export function practiceMessage(practice: ClaimedPractice): string {
  const source = practice.sourceTitle
    ? `\n\nSource: ${practice.sourceTitle}`
    : '';
  const text = `Practice\n\n${practice.originalText}${source}`;
  return text.length <= MAX_TELEGRAM_MESSAGE_LENGTH
    ? text
    : `${text.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH - 1)}…`;
}

export function practiceKeyboard(noteId: string) {
  return [
    [{ text: 'Reread', callbackData: `p:r:${noteId}` }],
    [
      { text: 'Reflect', callbackData: `p:e:r:${noteId}` },
      { text: 'Add story', callbackData: `p:e:s:${noteId}` },
    ],
    [
      { text: 'Pause', callbackData: `p:p:${noteId}` },
      { text: 'Integrated', callbackData: `p:i:${noteId}` },
    ],
    [{ text: 'Change interval', callbackData: `p:n:${noteId}` }],
  ];
}

export function readyPracticeMessage(practice: ClaimedReadyPractice): string {
  const source = practice.sourceTitle
    ? `\n\nSource: ${practice.sourceTitle}`
    : '';
  const text = `Ready to resume\n\n${practice.originalText}${source}\n\nA Practice slot was not available when this pause ended.`;
  return text.length <= MAX_TELEGRAM_MESSAGE_LENGTH
    ? text
    : `${text.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH - 1)}…`;
}

export function checkInMessage(checkIns: ClaimedCheckIn[]): string {
  return [
    'Integrated check-in',
    '',
    ...checkIns.flatMap((checkIn, index) => [
      `${index + 1}. ${checkIn.originalText}`,
      ...(checkIn.sourceTitle ? [`Source: ${checkIn.sourceTitle}`] : []),
      '',
    ]),
  ]
    .join('\n')
    .slice(0, MAX_TELEGRAM_MESSAGE_LENGTH);
}

export async function processNotifications(
  dependencies: NotificationProcessorDependencies,
): Promise<{
  practicesSent: number;
  readySent: number;
  checkInPacketsSent: number;
  errors: number;
}> {
  const now = dependencies.now?.() ?? new Date();
  const profiles = await dependencies.repository.profiles();
  const counts = {
    practicesSent: 0,
    readySent: 0,
    checkInPacketsSent: 0,
    errors: 0,
  };

  const processProfile = async (profile: NotificationProfile) => {
    const result = {
      practicesSent: 0,
      readySent: 0,
      checkInPacketsSent: 0,
      errors: 0,
    };
    const window = scheduleWindow(now, profile);
    if (!window.practiceDate) return result;
    try {
      await dependencies.repository.reconcileDuePauses(
        profile.userId,
        window.practiceDate,
        now.toISOString(),
      );
    } catch {
      result.errors += 1;
      return result;
    }
    if (profile.chatId === null) return result;

    let readyPractices: ClaimedReadyPractice[];
    try {
      readyPractices = await dependencies.repository.claimReadyPractices(
        profile.userId,
        now.toISOString(),
      );
    } catch {
      result.errors += 1;
      readyPractices = [];
    }
    for (const practice of readyPractices) {
      try {
        await dependencies.telegram.sendMessage(
          profile.chatId,
          readyPracticeMessage(practice),
          {
            inlineKeyboard: [
              [
                {
                  text: 'Resume practice',
                  callbackData: `p:u:${practice.noteId}`,
                },
              ],
            ],
          },
        );
        if (
          await dependencies.repository.markReadyPracticeSent(
            profile.userId,
            practice.noteId,
            window.practiceDate,
          )
        ) {
          result.readySent += 1;
        } else {
          result.errors += 1;
        }
      } catch {
        result.errors += 1;
      }
    }

    let practices: ClaimedPractice[];
    try {
      practices = await dependencies.repository.claimDuePractices(
        profile.userId,
        window.practiceDate,
        now.toISOString(),
      );
    } catch {
      result.errors += 1;
      return result;
    }
    for (const practice of practices) {
      try {
        await dependencies.telegram.sendMessage(
          profile.chatId,
          practiceMessage(practice),
          {
            inlineKeyboard: practiceKeyboard(practice.noteId),
          },
        );
        if (
          await dependencies.repository.markPracticeSent(
            profile.userId,
            practice.noteId,
            window.practiceDate,
            now.toISOString(),
          )
        ) {
          result.practicesSent += 1;
        } else {
          result.errors += 1;
        }
      } catch {
        result.errors += 1;
      }
    }

    let checkIns: ClaimedCheckIn[];
    try {
      checkIns = await dependencies.repository.claimDueCheckIns(
        profile.userId,
        window.practiceDate,
        now.toISOString(),
      );
    } catch {
      result.errors += 1;
      checkIns = [];
    }
    if (checkIns.length > 0) {
      try {
        await dependencies.telegram.sendMessage(
          profile.chatId,
          checkInMessage(checkIns),
          {
            inlineKeyboard: checkIns.flatMap((checkIn, index) => [
              [
                {
                  text: `${index + 1} Still integrated`,
                  callbackData: `p:c:${checkIn.noteId}`,
                },
              ],
              [
                {
                  text: `${index + 1} Resume practice`,
                  callbackData: `p:u:${checkIn.noteId}`,
                },
                {
                  text: `${index + 1} Stop check-ins`,
                  callbackData: `p:x:${checkIn.noteId}`,
                },
              ],
            ]),
          },
        );
        if (
          await dependencies.repository.markCheckInsSent(
            profile.userId,
            checkIns.map((checkIn) => checkIn.noteId),
            window.practiceDate,
          )
        ) {
          result.checkInPacketsSent += 1;
        } else {
          result.errors += 1;
        }
      } catch {
        result.errors += 1;
      }
    }
    return result;
  };

  for (let index = 0; index < profiles.length; index += PROFILE_CONCURRENCY) {
    const batch = await Promise.all(
      profiles.slice(index, index + PROFILE_CONCURRENCY).map(processProfile),
    );
    for (const result of batch) {
      counts.practicesSent += result.practicesSent;
      counts.readySent += result.readySent;
      counts.checkInPacketsSent += result.checkInPacketsSent;
      counts.errors += result.errors;
    }
  }
  return counts;
}

async function authorized(request: Request, secret: string): Promise<boolean> {
  const authorization = request.headers.get('Authorization');
  return secureTelegramSecretMatches(
    authorization?.replace(/^Bearer\s+/iu, '') ?? '',
    secret,
  );
}

export function createNotificationHandler(
  dependencies: NotificationProcessorDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'POST') {
      return errorResponse(
        new ApiError(
          405,
          'method_not_allowed',
          'Only POST requests are supported.',
        ),
      );
    }
    if (!(await authorized(request, dependencies.cronSecret))) {
      return errorResponse(
        new ApiError(401, 'unauthorized', 'Authentication is required.'),
      );
    }
    try {
      const body = await parseOptionalJson(request);
      if (body !== null) {
        if (
          typeof body !== 'object' ||
          Array.isArray(body) ||
          Object.keys(body).length !== 1 ||
          (body as { probe?: unknown }).probe !== true
        ) {
          throw new ApiError(400, 'bad_request', 'Request body is invalid.');
        }
        return Response.json({ ok: true, probe: true });
      }
      return Response.json(await processNotifications(dependencies));
    } catch (error) {
      return errorResponse(error);
    }
  };
}
