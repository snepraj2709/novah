export function normalizeCapturedText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function optionalNormalizedText(
  value: string | undefined,
): string | undefined {
  return value === undefined ? undefined : normalizeCapturedText(value);
}
