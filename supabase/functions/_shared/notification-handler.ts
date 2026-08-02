import {
  dailyDigestSchema,
  type DailyDigest,
} from '../../../packages/shared/src/contracts/index.ts';
import { MAX_TELEGRAM_MESSAGE_LENGTH } from '../../../packages/shared/src/constants/index.ts';
import { ApiError, errorResponse } from './errors.ts';
import { parseOptionalJson } from './http.ts';
import type {
  ClaimedReview,
  DigestEvidenceNote,
  DigestGenerator,
  NotificationProfile,
  NotificationRepository,
  NotificationTelegramGateway,
} from './notification-types.ts';
import { reviewCallbackData } from './review-callbacks.ts';
import { secureTelegramSecretMatches } from './telegram-handler.ts';

const WINDOW_MINUTES = 10;
const PROFILE_CONCURRENCY = 5;
const MAX_DIGEST_MODEL_NOTES = 100;
const MAX_DIGEST_MODEL_CHARACTERS = 100_000;

function boundedMessage(text: string): string {
  if (text.length <= MAX_TELEGRAM_MESSAGE_LENGTH) return text;
  return `${text.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH - 1)}…`;
}

export interface NotificationProcessorDependencies {
  cronSecret: string;
  repository: NotificationRepository;
  digestGenerator: DigestGenerator;
  telegram: NotificationTelegramGateway;
  now?: () => Date;
}

export interface ScheduleWindow {
  localDate: string;
  digestDate: string | null;
  reviewDate: string | null;
}

interface DeliveryCounts {
  digestsSent: number;
  reviewPacketsSent: number;
  errors: number;
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
  const year = Number(value('year'));
  const month = Number(value('month'));
  const day = Number(value('day'));
  const hour = Number(value('hour'));
  const minute = Number(value('minute'));
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minuteOfDay: hour * 60 + minute,
    ordinalMinute: Date.UTC(year, month - 1, day, hour, minute) / 60_000,
  };
}

function previousDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function scheduledDate(
  localDate: string,
  minuteOfDay: number,
  scheduledTime: string,
): string | null {
  const [hour, minute] = scheduledTime.split(':').map(Number);
  const scheduledMinute = hour * 60 + minute;
  const elapsed = (minuteOfDay - scheduledMinute + 1_440) % 1_440;
  if (elapsed >= WINDOW_MINUTES) return null;
  return minuteOfDay < scheduledMinute ? previousDate(localDate) : localDate;
}

function forwardGapScheduledDate(
  now: Date,
  timezone: string,
  current: LocalParts,
  scheduledTime: string,
): string | null {
  const [scheduledHour, scheduledMinute] = scheduledTime.split(':').map(Number);
  const currentInstantMinute = Math.floor(now.getTime() / 60_000);
  const beforeWindow = localParts(
    new Date((currentInstantMinute - WINDOW_MINUTES) * 60_000),
    timezone,
  );
  if (current.ordinalMinute - beforeWindow.ordinalMinute <= WINDOW_MINUTES) {
    return null;
  }
  for (let elapsed = 0; elapsed < WINDOW_MINUTES; elapsed += 1) {
    const after = localParts(
      new Date((currentInstantMinute - elapsed) * 60_000),
      timezone,
    );
    const before = localParts(
      new Date((currentInstantMinute - elapsed - 1) * 60_000),
      timezone,
    );
    if (after.ordinalMinute - before.ordinalMinute <= 1) continue;

    const [year, month, day] = after.date.split('-').map(Number);
    const scheduledOrdinal =
      Date.UTC(year, month - 1, day, scheduledHour, scheduledMinute) / 60_000;
    if (
      scheduledOrdinal > before.ordinalMinute &&
      scheduledOrdinal < after.ordinalMinute
    ) {
      return new Date(scheduledOrdinal * 60_000).toISOString().slice(0, 10);
    }
  }
  return null;
}

function scheduleDateForTimezone(
  now: Date,
  timezone: string,
  local: LocalParts,
  scheduledTime: string,
): string | null {
  return (
    scheduledDate(local.date, local.minuteOfDay, scheduledTime) ??
    forwardGapScheduledDate(now, timezone, local, scheduledTime)
  );
}

export function scheduleWindow(
  now: Date,
  profile: Pick<NotificationProfile, 'timezone' | 'digestTime' | 'reviewTime'>,
): ScheduleWindow {
  const local = localParts(now, profile.timezone);
  return {
    localDate: local.date,
    digestDate: scheduleDateForTimezone(
      now,
      profile.timezone,
      local,
      profile.digestTime,
    ),
    reviewDate: scheduleDateForTimezone(
      now,
      profile.timezone,
      local,
      profile.reviewTime,
    ),
  };
}

function sourceCount(notes: DigestEvidenceNote[]): number {
  return new Set(
    notes.flatMap((note) => {
      const identity = note.sourceUrl ?? note.sourceTitle;
      return identity ? [identity] : [];
    }),
  ).size;
}

function oneNoteDigest(note: DigestEvidenceNote): DailyDigest {
  return dailyDigestSchema.parse({
    captureCount: 1,
    sourceCount: sourceCount([note]),
    themes: [],
    connection: null,
    reflectionQuestion: note.recallPrompt,
  });
}

function evidenceCharacters(notes: DigestEvidenceNote[]): number {
  return notes.reduce(
    (total, note) =>
      total +
      note.originalText.length +
      (note.personalContext?.length ?? 0) +
      note.summary.length +
      note.recallPrompt.length +
      (note.sourceTitle?.length ?? 0) +
      (note.sourceUrl?.length ?? 0),
    0,
  );
}

function oversizedDayDigest(notes: DigestEvidenceNote[]): DailyDigest {
  return dailyDigestSchema.parse({
    captureCount: notes.length,
    sourceCount: sourceCount(notes),
    themes: [],
    connection: null,
    reflectionQuestion:
      'Which idea from today is most worth carrying into tomorrow?',
  });
}

function evidenceNumbers(noteIds: string[], evidence: DigestEvidenceNote[]) {
  const numberById = new Map(
    evidence.map((note, index) => [note.noteId, index + 1]),
  );
  return noteIds
    .flatMap((noteId) => {
      const number = numberById.get(noteId);
      return number ? [number] : [];
    })
    .map((number) => `[${number}]`)
    .join('');
}

export function digestMessage(
  digest: DailyDigest,
  evidence: DigestEvidenceNote[],
): string {
  const header = [
    'What you kept today',
    '',
    `You saved ${digest.captureCount} ${digest.captureCount === 1 ? 'idea' : 'ideas'} from ${digest.sourceCount} ${digest.sourceCount === 1 ? 'source' : 'sources'}.`,
  ];
  if (evidence.length === 1) {
    const original =
      evidence[0].originalText.length <= 3_000
        ? evidence[0].originalText
        : `${evidence[0].originalText.slice(0, 2_999)}…`;
    return [
      ...header,
      '',
      'One idea',
      `${original} [1]`,
      '',
      'For tomorrow',
      digest.reflectionQuestion,
    ].join('\n');
  }

  const themes = digest.themes.flatMap((theme) => [
    '',
    'Recurring theme',
    `${theme.title} ${evidenceNumbers(theme.noteIds, evidence)}`,
  ]);
  const connection = digest.connection
    ? [
        '',
        'A useful connection',
        `${digest.connection.text} ${evidenceNumbers(digest.connection.noteIds, evidence)}`,
      ]
    : [];
  return [
    ...header,
    ...themes,
    ...connection,
    '',
    'For tomorrow',
    digest.reflectionQuestion,
  ].join('\n');
}

export function reviewPacket(reviews: ClaimedReview[]) {
  const chunks: ClaimedReview[][] = [];
  for (let index = 0; index < reviews.length; index += 8) {
    chunks.push(reviews.slice(index, index + 8));
  }
  return chunks.map((chunk, chunkIndex) => {
    const offset = chunkIndex * 8;
    const text = [
      chunkIndex === 0 ? 'Reviews due' : 'Reviews due — continued',
      '',
      'Before revealing each note, what do you remember from its source?',
      '',
      ...chunk.map((review, index) => {
        const number = offset + index + 1;
        const source = review.sourceTitle
          ? ` — ${review.sourceTitle.slice(0, 120)}`
          : '';
        const prompt =
          review.recallPrompt.length <= 320
            ? review.recallPrompt
            : `${review.recallPrompt.slice(0, 319)}…`;
        return `${number}. Stage ${review.stage}${source}\n${prompt}`;
      }),
    ].join('\n\n');
    return {
      text: boundedMessage(text),
      options: {
        inlineKeyboard: chunk.map((review, index) => {
          const number = offset + index + 1;
          return [
            {
              text: `Reveal ${number}`,
              callbackData: reviewCallbackData(review.eventId, 'reveal'),
            },
            {
              text: `Skip ${number}`,
              callbackData: reviewCallbackData(review.eventId, 'skip'),
            },
          ];
        }),
      },
    };
  });
}

async function authorized(request: Request, secret: string): Promise<boolean> {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer ([^\s]+)$/u);
  return secureTelegramSecretMatches(secret, match?.[1] ?? null);
}

export async function processNotifications(
  dependencies: NotificationProcessorDependencies,
): Promise<{
  profilesChecked: number;
  digestsSent: number;
  reviewPacketsSent: number;
  errors: number;
}> {
  const now = (dependencies.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const profiles = await dependencies.repository.profiles();
  const counts = {
    profilesChecked: profiles.length,
    digestsSent: 0,
    reviewPacketsSent: 0,
    errors: 0,
  };

  const processProfile = async (
    profile: NotificationProfile,
  ): Promise<DeliveryCounts> => {
    const profileCounts: DeliveryCounts = {
      digestsSent: 0,
      reviewPacketsSent: 0,
      errors: 0,
    };
    let window: ScheduleWindow;
    try {
      window = scheduleWindow(now, profile);
    } catch {
      profileCounts.errors += 1;
      return profileCounts;
    }
    if (window.digestDate) {
      try {
        const evidence = await dependencies.repository.digestEvidence(
          profile.userId,
          window.digestDate,
        );
        if (evidence.length > 0) {
          const digest =
            evidence.length === 1
              ? oneNoteDigest(evidence[0])
              : evidence.length > MAX_DIGEST_MODEL_NOTES ||
                  evidenceCharacters(evidence) > MAX_DIGEST_MODEL_CHARACTERS
                ? oversizedDayDigest(evidence)
                : await dependencies.digestGenerator.generateDigest({
                    captureCount: evidence.length,
                    sourceCount: sourceCount(evidence),
                    notes: evidence,
                  });
          const validated = dailyDigestSchema.parse(digest);
          const digestId = await dependencies.repository.claimDigest(
            profile.userId,
            window.digestDate,
            evidence.map((note) => note.noteId),
            validated,
          );
          if (digestId) {
            await dependencies.telegram.sendMessage(
              profile.chatId,
              boundedMessage(digestMessage(validated, evidence)),
            );
            const marked = await dependencies.repository.markDigestSent(
              digestId,
              nowIso,
            );
            if (!marked) throw new Error('Digest delivery was not marked sent');
            profileCounts.digestsSent += 1;
          }
        }
      } catch {
        profileCounts.errors += 1;
      }
    }

    if (window.reviewDate) {
      try {
        const reviews = await dependencies.repository.claimReviews(
          profile.userId,
          window.reviewDate,
          nowIso,
        );
        if (reviews.length > 0) {
          const packets = reviewPacket(reviews);
          for (let index = 0; index < packets.length; index += 1) {
            const packet = packets[index];
            const packetReviews = reviews.slice(index * 8, index * 8 + 8);
            await dependencies.telegram.sendMessage(
              profile.chatId,
              packet.text,
              packet.options,
            );
            const marked = await dependencies.repository.markReviewsSent(
              packetReviews.map((review) => review.eventId),
              nowIso,
            );
            if (marked !== packetReviews.length) {
              throw new Error('Review delivery was not fully marked sent');
            }
            profileCounts.reviewPacketsSent += 1;
          }
        }
      } catch {
        profileCounts.errors += 1;
      }
    }
    return profileCounts;
  };

  for (let index = 0; index < profiles.length; index += PROFILE_CONCURRENCY) {
    const batchCounts = await Promise.all(
      profiles
        .slice(index, index + PROFILE_CONCURRENCY)
        .map((profile) => processProfile(profile)),
    );
    for (const profileCounts of batchCounts) {
      counts.digestsSent += profileCounts.digestsSent;
      counts.reviewPacketsSent += profileCounts.reviewPacketsSent;
      counts.errors += profileCounts.errors;
    }
  }
  return counts;
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
        new ApiError(401, 'unauthorized', 'Cron authentication failed.'),
      );
    }
    let body: unknown;
    try {
      body = await parseOptionalJson(request);
    } catch (error) {
      return errorResponse(error);
    }
    if (
      body &&
      typeof body === 'object' &&
      'probe' in body &&
      body.probe === true
    ) {
      return Response.json({ ok: true, probe: true });
    }
    try {
      return Response.json(await processNotifications(dependencies));
    } catch (error) {
      return errorResponse(error);
    }
  };
}
