import { describe, expect, it } from 'vitest';

import { inferOpenRouterExtraSupportedParameters, OPENROUTER_MODEL_OPTIONS } from './openRouterDefaults';

describe('openRouterDefaults', () => {
  it('returns non-reasoning extras for models with generation tool support', () => {
    const extras = inferOpenRouterExtraSupportedParameters('mistralai/mistral-small-2603');
    expect(extras).toEqual(['tools', 'response_format', 'structured_outputs']);
  });

  it('returns undefined for models without non-reasoning extras', () => {
    const baseModel = OPENROUTER_MODEL_OPTIONS.find((model) => model !== 'mistralai/mistral-small-2603');
    expect(baseModel).toBeDefined();
    if (!baseModel) return;
    expect(inferOpenRouterExtraSupportedParameters(baseModel)).toBeUndefined();
  });
});
