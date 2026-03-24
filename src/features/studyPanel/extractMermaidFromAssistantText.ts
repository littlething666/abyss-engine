const MERMAID_FENCE =
  /```\s*mermaid\s*(?:\r?\n|\r)([\s\S]*?)```/i;

/**
 * Returns the first ```mermaid fenced block body, trimmed, or null if none.
 */
export function extractMermaidFromAssistantText(text: string): string | null {
  const match = text.match(MERMAID_FENCE);
  if (!match || typeof match[1] !== 'string') {
    return null;
  }
  const body = match[1].trim();
  return body.length > 0 ? body : null;
}
