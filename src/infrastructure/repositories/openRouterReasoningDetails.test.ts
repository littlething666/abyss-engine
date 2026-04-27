import { describe, expect, it } from 'vitest';

import {
  formatOpenRouterReasoningDetails,
  mergeAssistantReasoningDetails,
  reasoningTextFromOpenRouterDelta,
} from './openRouterReasoningDetails';

describe('openRouterReasoningDetails', () => {
  it('preserves whitespace in streamed reasoning fragments', () => {
    const first = reasoningTextFromOpenRouterDelta({
      reasoning_details: [{ type: 'reasoning.text', text: ' the ' }],
    });
    const second = reasoningTextFromOpenRouterDelta({
      reasoning_details: [{ type: 'reasoning.text', text: 'answer' }],
    });
    const reasoningAcc = `${first ?? ''}${second ?? ''}`;
    expect(reasoningAcc).toBe(' the answer');
  });

  it('drops whitespace-only reasoning fragments while preserving surrounding tokens', () => {
    const details = formatOpenRouterReasoningDetails([{ type: 'reasoning.text', text: 'Hello' }, '   ']);
    expect(details).toBe('Hello');
  });

  it('preserves the text from non-streaming merge helper', () => {
    const merged = mergeAssistantReasoningDetails({
      reasoning_details: [{ type: 'reasoning.text', text: '  Hello world  ' }],
    });
    expect(merged).toBe('  Hello world  ');
  });
});
