import { describe, expect, it } from 'vitest';

import { extractMermaidFromAssistantText } from './extractMermaidFromAssistantText';

describe('extractMermaidFromAssistantText', () => {
  it('extracts the first mermaid fenced block', () => {
    const src = extractMermaidFromAssistantText(
      'Here\n```mermaid\nflowchart LR\n  A --> B\n```\n',
    );
    expect(src).toBe('flowchart LR\n  A --> B');
  });

  it('is case-insensitive on the fence language tag', () => {
    expect(extractMermaidFromAssistantText('```MERMAID\ngraph TD\n  x\n```')).toBe('graph TD\n  x');
  });

  it('returns the first block when multiple exist', () => {
    const out = extractMermaidFromAssistantText(
      '```mermaid\na\n```\n```mermaid\nb\n```',
    );
    expect(out).toBe('a');
  });

  it('returns null when there is no mermaid fence', () => {
    expect(extractMermaidFromAssistantText('flowchart LR\n  A --> B')).toBeNull();
    expect(extractMermaidFromAssistantText('```js\n1\n```')).toBeNull();
    expect(extractMermaidFromAssistantText('')).toBeNull();
  });

  it('returns null for an empty fenced body', () => {
    expect(extractMermaidFromAssistantText('```mermaid\n```')).toBeNull();
    expect(extractMermaidFromAssistantText('```mermaid\n   \n```')).toBeNull();
  });
});
