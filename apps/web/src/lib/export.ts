import type { DashboardNote } from './dashboard.ts';

export function jsonExport(notes: DashboardNote[], exportedAt: Date): string {
  return JSON.stringify(
    {
      format: 'novah-export',
      version: 2,
      exportedAt: exportedAt.toISOString(),
      notes: notes.map((note) => ({
        id: note.id,
        originalText: note.originalText,
        personalContext: note.personalContext,
        noteType: note.noteType,
        sourceTitle: note.sourceTitle,
        sourceUrl: note.sourceUrl,
        captureChannel: note.captureChannel,
        capturedAt: note.capturedAt,
      })),
    },
    null,
    2,
  );
}

function normalizedLines(value: string): string {
  return value.replace(/\r\n?/gu, '\n');
}

function markdownInline(value: string): string {
  return normalizedLines(value)
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/([\\`[\]<>])/gu, '\\$1');
}

function markdownCodeBlock(value: string): string[] {
  const content = normalizedLines(value);
  const longestFence = Math.max(
    0,
    ...Array.from(content.matchAll(/`+/gu), (match) => match[0].length),
  );
  const fence = '`'.repeat(Math.max(3, longestFence + 1));
  return [fence, content, fence];
}

export function markdownExport(
  notes: DashboardNote[],
  exportedAt: Date,
): string {
  const header = [
    '# Novah export',
    '',
    `Exported: ${exportedAt.toISOString()}`,
    `Notes: ${notes.length}`,
  ];
  const sections = notes.flatMap((note, index) => [
    '',
    '---',
    '',
    `## ${index + 1}. ${note.sourceTitle ? markdownInline(note.sourceTitle) : 'Note'}`,
    '',
    `- Type: ${note.noteType}`,
    `- Captured: ${note.capturedAt}`,
    ...(note.captureChannel ? [`- Channel: ${note.captureChannel}`] : []),
    ...(note.sourceTitle
      ? [`- Source title: ${markdownInline(note.sourceTitle)}`]
      : []),
    ...(note.sourceUrl
      ? [`- Source URL: ${markdownInline(note.sourceUrl)}`]
      : []),
    '',
    '### Original note',
    '',
    ...markdownCodeBlock(note.originalText),
    ...(note.personalContext
      ? [
          '',
          '### Why it mattered',
          '',
          ...markdownCodeBlock(note.personalContext),
        ]
      : []),
  ]);
  return [...header, ...sections, ''].join('\n');
}

export function downloadText(
  filename: string,
  content: string,
  type: string,
): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
