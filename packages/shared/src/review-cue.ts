const REVIEW_SOURCE_LENGTH = 120;

export function normalizedReviewSource(
  sourceTitle: string | null,
): string | null {
  if (!sourceTitle) return null;
  const normalized = sourceTitle
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!normalized) return null;
  const characters = Array.from(normalized);
  if (characters.length <= REVIEW_SOURCE_LENGTH) return normalized;
  return `${characters.slice(0, REVIEW_SOURCE_LENGTH - 1).join('')}…`;
}

export function reviewCue(sourceTitle: string | null): string {
  const source = normalizedReviewSource(sourceTitle);
  return source
    ? `What do you remember from ${source}?`
    : 'What do you remember from this note?';
}
