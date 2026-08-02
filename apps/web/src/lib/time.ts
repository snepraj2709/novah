export function localDateFor(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) throw new Error('Timezone conversion failed.');
  return `${year}-${month}-${day}`;
}

export function candidateUtcRange(localDate: string): {
  start: string;
  end: string;
} {
  const midnight = new Date(`${localDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(midnight)) throw new Error('Invalid local date.');
  return {
    start: new Date(midnight - 14 * 60 * 60 * 1_000).toISOString(),
    end: new Date(midnight + 38 * 60 * 60 * 1_000).toISOString(),
  };
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(`${value}T12:00:00.000Z`),
  );
}
