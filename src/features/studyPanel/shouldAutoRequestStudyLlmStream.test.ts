import { describe, expect, it } from 'vitest';

import { shouldAutoRequestStudyLlmStream } from './shouldAutoRequestStudyLlmStream';

describe('shouldAutoRequestStudyLlmStream', () => {
  it('returns false while pending', () => {
    expect(
      shouldAutoRequestStudyLlmStream({
        isPending: true,
        assistantText: null,
        errorMessage: null,
      }),
    ).toBe(false);
    expect(
      shouldAutoRequestStudyLlmStream({
        isPending: true,
        assistantText: 'partial',
        errorMessage: null,
      }),
    ).toBe(false);
  });

  it('returns true when idle with no assistant text', () => {
    expect(
      shouldAutoRequestStudyLlmStream({
        isPending: false,
        assistantText: null,
        errorMessage: null,
      }),
    ).toBe(true);
  });

  it('returns true when idle with an error even if text exists', () => {
    expect(
      shouldAutoRequestStudyLlmStream({
        isPending: false,
        assistantText: 'prior',
        errorMessage: 'boom',
      }),
    ).toBe(true);
  });

  it('returns false when idle with successful text and no error', () => {
    expect(
      shouldAutoRequestStudyLlmStream({
        isPending: false,
        assistantText: 'done',
        errorMessage: null,
      }),
    ).toBe(false);
  });

  it('returns false for empty string when there is no error (same as non-null text)', () => {
    expect(
      shouldAutoRequestStudyLlmStream({
        isPending: false,
        assistantText: '',
        errorMessage: null,
      }),
    ).toBe(false);
  });
});
