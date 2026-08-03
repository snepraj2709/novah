export const PRACTICE_PROMPTS = [
  'What feels most relevant in this today?',
  'Where did this show up in your life recently?',
  'Where did you forget or resist this?',
  'What would living this look like today?',
  'Has your understanding of this changed?',
] as const;

export function practicePrompt(noteId: string, entryCount: number): string {
  let noteHash = 0;
  for (const character of noteId) {
    noteHash = (noteHash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return PRACTICE_PROMPTS[(noteHash + entryCount) % PRACTICE_PROMPTS.length];
}
