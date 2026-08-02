const REVIEW_CALLBACK_PATTERN =
  /^review:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):(reveal|skip|remembered|partial|missed)$/iu;

export type ReviewCallbackAction =
  'reveal' | 'skip' | 'remembered' | 'partial' | 'missed';

export interface ReviewCallback {
  eventId: string;
  action: ReviewCallbackAction;
}

export function reviewCallbackData(
  eventId: string,
  action: ReviewCallbackAction,
): string {
  return `review:${eventId}:${action}`;
}

export function parseReviewCallback(data: string): ReviewCallback | null {
  const match = data.match(REVIEW_CALLBACK_PATTERN);
  return match
    ? {
        eventId: match[1].toLowerCase(),
        action: match[2].toLowerCase() as ReviewCallbackAction,
      }
    : null;
}
