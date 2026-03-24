import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getChatCompletionsRepositoryForSurface,
  resetLlmInferenceRegistryForTests,
} from './llmInferenceRegistry';

describe('llmInferenceRegistry', () => {
  beforeEach(() => {
    resetLlmInferenceRegistryForTests();
  });

  afterEach(() => {
    resetLlmInferenceRegistryForTests();
  });

  it('returns the same repository instance for surfaces that share a provider', () => {
    const a = getChatCompletionsRepositoryForSurface('studyQuestionExplain');
    const b = getChatCompletionsRepositoryForSurface('studyFormulaExplain');
    expect(a).toBe(b);
  });

  it('constructs a new instance after reset', () => {
    const first = getChatCompletionsRepositoryForSurface('studyQuestionExplain');
    resetLlmInferenceRegistryForTests();
    const second = getChatCompletionsRepositoryForSurface('studyQuestionExplain');
    expect(second).not.toBe(first);
  });
});
