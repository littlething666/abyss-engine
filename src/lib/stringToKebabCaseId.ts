/**
 * Normalizes arbitrary text to a lowercase ASCII kebab-case token.
 * Non-alphanumeric runs become single hyphens; leading/trailing hyphens are stripped.
 * Non-empty results match `^[a-z0-9]+(?:-[a-z0-9]+)*$` (stable ids, slugs, theme keys).
 */
export function stringToKebabCaseId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
