import type { DashboardNote } from './dashboard.ts';

export function jsonExport(notes: DashboardNote[], exportedAt: Date): string {
  return JSON.stringify(
    {
      format: 'novah-export',
      version: 1,
      exportedAt: exportedAt.toISOString(),
      notes,
    },
    null,
    2,
  );
}

function markdownValue(value: string): string {
  return value.replace(/\r\n?/gu, '\n').trim();
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
    `## ${index + 1}. ${markdownValue(note.sourceTitle ?? note.summary)}`,
    '',
    `- Type: ${note.noteType}`,
    `- Captured: ${note.capturedAt}`,
    ...(note.captureChannel ? [`- Channel: ${note.captureChannel}`] : []),
    ...(note.sourceUrl ? [`- Source: ${note.sourceUrl}`] : []),
    ...(note.tags.length ? [`- Tags: ${note.tags.join(', ')}`] : []),
    '',
    '### Original note',
    '',
    markdownValue(note.originalText),
    ...(note.personalContext
      ? ['', '### Why it mattered', '', markdownValue(note.personalContext)]
      : []),
    '',
    '### Summary',
    '',
    markdownValue(note.summary),
    '',
    '### Recall prompt',
    '',
    markdownValue(note.recallPrompt),
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
