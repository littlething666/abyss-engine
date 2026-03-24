import { describe, expect, it } from 'vitest';

import { buildScreenCaptureSummaryMessages } from './buildScreenCaptureSummaryMessages';

describe('buildScreenCaptureSummaryMessages', () => {
  it('builds a user message with text and image_url parts', () => {
    const url = 'data:image/png;base64,abc';
    const messages = buildScreenCaptureSummaryMessages(url);

    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe('user');
    const content = messages[0]!.content;
    expect(Array.isArray(content)).toBe(true);
    if (!Array.isArray(content)) {
      return;
    }
    expect(content[0]).toEqual({ type: 'text', text: expect.stringContaining('Summarize') });
    expect(content[1]).toEqual({ type: 'image_url', image_url: { url } });
  });

  it('uses instructionText when provided', () => {
    const messages = buildScreenCaptureSummaryMessages('data:image/png;base64,x', 'What is in this image?');
    const content = messages[0]!.content;
    expect(Array.isArray(content)).toBe(true);
    if (!Array.isArray(content)) {
      return;
    }
    expect(content[0]).toEqual({ type: 'text', text: 'What is in this image?' });
  });
});
