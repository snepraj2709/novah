import type { SearchMatch } from './contracts.ts';
import type { SynthesisClaim } from './types.ts';

export interface RenderedSynthesis {
  answer: string;
  citations: Array<{ number: number; noteId: string }>;
}

export function renderGroundedSynthesis(
  claims: SynthesisClaim[],
  matches: SearchMatch[],
): RenderedSynthesis | null {
  const allowedIds = new Set(matches.map((match) => match.noteId));
  const citationNumbers = new Map<string, number>();
  const renderedClaims: string[] = [];

  if (claims.length === 0) return null;

  for (const claim of claims) {
    const text = claim.text.trim();
    const uniqueIds = [...new Set(claim.noteIds)];
    if (
      !text ||
      uniqueIds.length === 0 ||
      uniqueIds.some((id) => !allowedIds.has(id))
    ) {
      return null;
    }

    const markers = uniqueIds.map((noteId) => {
      let number = citationNumbers.get(noteId);
      if (!number) {
        number = citationNumbers.size + 1;
        citationNumbers.set(noteId, number);
      }
      return `[${number}]`;
    });
    renderedClaims.push(`${text} ${markers.join('')}`);
  }

  return {
    answer: renderedClaims.join(' '),
    citations: [...citationNumbers.entries()].map(([noteId, number]) => ({
      number,
      noteId,
    })),
  };
}
