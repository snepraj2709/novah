export type AnswerSegment =
  | { type: 'text'; value: string }
  | { type: 'citation'; value: string; number: number; noteId: string };

export function answerSegments(
  answer: string,
  citations: Array<{ number: number; noteId: string }>,
): AnswerSegment[] {
  const noteIds = new Map(
    citations.map((citation) => [citation.number, citation.noteId]),
  );
  const segments: AnswerSegment[] = [];
  const pattern = /\[(\d+)\]/gu;
  let cursor = 0;

  for (const match of answer.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ type: 'text', value: answer.slice(cursor, index) });
    }
    const number = Number(match[1]);
    const noteId = noteIds.get(number);
    if (noteId) {
      segments.push({
        type: 'citation',
        value: match[0],
        number,
        noteId,
      });
    } else {
      segments.push({ type: 'text', value: match[0] });
    }
    cursor = index + match[0].length;
  }

  if (cursor < answer.length) {
    segments.push({ type: 'text', value: answer.slice(cursor) });
  }
  return segments;
}
