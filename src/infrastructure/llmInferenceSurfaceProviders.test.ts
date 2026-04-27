import { beforeEach, describe, expect, it } from 'vitest';

import { studySettingsStore } from '@/store/studySettingsStore';
import { resolveEnableReasoningForSurface, resolveIncludeOpenRouterReasoningParam } from './llmInferenceSurfaceProviders';

describe('llmInferenceSurfaceProviders', () => {
  beforeEach(() => {
    const baseState = studySettingsStore.getState();
    studySettingsStore.setState({
      ...baseState,
      openRouterConfigs: [
        {
          id: 'seed-1',
          label: 'Seed',
          model: 'google/gemma-4-26b-a4b-it:free',
          enableReasoning: false,
          enableStreaming: true,
        },
      ],
      surfaceProviders: {
        ...baseState.surfaceProviders,
        studyQuestionExplain: { provider: 'openrouter', openRouterConfigId: 'seed-1' },
      },
    });
  });

  it('includes OpenRouter reasoning based on provider binding, not model allowlist', () => {
    expect(resolveIncludeOpenRouterReasoningParam('studyQuestionExplain')).toBe(true);
    expect(resolveEnableReasoningForSurface('studyQuestionExplain')).toBe(false);
  });

  it('requires a known OpenRouter config before including reasoning', () => {
    studySettingsStore.setState({
      ...studySettingsStore.getState(),
      surfaceProviders: {
        ...studySettingsStore.getState().surfaceProviders,
        studyQuestionExplain: { provider: 'openrouter', openRouterConfigId: 'missing-config' },
      },
    });
    expect(resolveIncludeOpenRouterReasoningParam('studyQuestionExplain')).toBe(false);
    expect(resolveEnableReasoningForSurface('studyQuestionExplain')).toBe(false);
  });

  it('disables reasoning include when provider is local', () => {
    studySettingsStore.setState({
      ...studySettingsStore.getState(),
      surfaceProviders: {
        ...studySettingsStore.getState().surfaceProviders,
        studyQuestionExplain: { provider: 'local', openRouterConfigId: null },
      },
    });
    expect(resolveIncludeOpenRouterReasoningParam('studyQuestionExplain')).toBe(false);
    expect(resolveEnableReasoningForSurface('studyQuestionExplain')).toBe(false);
  });
});
