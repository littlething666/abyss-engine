import { afterEach, describe, expect, it, vi } from 'vitest';

import { FALLBACK_LLM_MODEL, resolveDefaultLlmModel } from './llmDefaultModel';

describe('resolveDefaultLlmModel', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns env value when set', () => {
    vi.stubEnv('NEXT_PUBLIC_LLM_MODEL', '  custom-model  ');
    expect(resolveDefaultLlmModel()).toBe('custom-model');
  });

  it('returns fallback when env unset', () => {
    vi.stubEnv('NEXT_PUBLIC_LLM_MODEL', '');
    expect(resolveDefaultLlmModel()).toBe(FALLBACK_LLM_MODEL);
  });
});
