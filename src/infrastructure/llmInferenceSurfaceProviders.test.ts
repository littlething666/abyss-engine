import { beforeEach, describe, expect, it } from 'vitest';

import {
  inferenceProviderForSurface,
  makeOpenRouterProviderSelector,
  resolveEnableReasoningForSurface,
  resolveEnableStreamingForSurface,
  resolveIncludeOpenRouterReasoningParam,
  resolveModelForSurface,
  resolveOpenRouterReasoningChatOptions,
  resolveOpenRouterStructuredChatExtrasForJob,
} from './llmInferenceSurfaceProviders';
import { createStudySettingsStore, studySettingsStore } from '@/store/studySettingsStore';
import type { ChatResponseFormatJsonSchema } from '@/types/llm';

const createStorageMock = (): Storage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) ?? null : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  } as Storage;
};

describe('llmInferenceSurfaceProviders', () => {
  beforeEach(() => {
    (globalThis as { localStorage: Storage }).localStorage = createStorageMock();
    localStorage.clear();
    const fresh = createStudySettingsStore().getState();
    studySettingsStore.setState({
      targetAudience: fresh.targetAudience,
      agentPersonality: fresh.agentPersonality,
      localModelId: fresh.localModelId,
      showStudyHistoryControls: fresh.showStudyHistoryControls,
      openRouterConfigs: fresh.openRouterConfigs,
      surfaceProviders: fresh.surfaceProviders,
    });
  });

  it('resolves study surface provider, model, reasoning, and streaming preferences', () => {
    const surfaceId = 'studyQuestionExplain';
    const state = studySettingsStore.getState();
    const configId = state.surfaceProviders[surfaceId].openRouterConfigId!;
    studySettingsStore.getState().updateOpenRouterConfig(configId, {
      model: 'anthropic/claude-sonnet-4',
      enableReasoning: true,
      enableStreaming: false,
    });

    expect(inferenceProviderForSurface(surfaceId)).toBe('openrouter');
    expect(resolveModelForSurface(surfaceId)).toBe('anthropic/claude-sonnet-4');
    expect(resolveIncludeOpenRouterReasoningParam(surfaceId)).toBe(true);
    expect(resolveEnableReasoningForSurface(surfaceId)).toBe(true);
    expect(resolveEnableStreamingForSurface(surfaceId)).toBe(false);
    expect(resolveOpenRouterReasoningChatOptions(surfaceId, true)).toEqual({
      includeOpenRouterReasoning: true,
      enableReasoning: true,
    });
  });

  it('builds OpenRouter structured extras for study surfaces without browser response-healing state', () => {
    const surfaceId = 'studyFormulaExplain';
    const state = studySettingsStore.getState();
    const configId = state.surfaceProviders[surfaceId].openRouterConfigId!;
    studySettingsStore.getState().updateOpenRouterConfig(configId, {
      supportedParameters: ['response_format', 'structured_outputs'],
    });
    const schema: ChatResponseFormatJsonSchema = {
      type: 'json_schema',
      json_schema: {
        name: 'study_explain',
        strict: true,
        schema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
      },
    };

    expect(resolveOpenRouterStructuredChatExtrasForJob(surfaceId, {
      jsonSchemaResponseFormat: schema,
      requireJsonSchema: true,
      allowProviderHealing: true,
    })).toEqual({
      responseFormat: schema,
      plugins: [{ id: 'response-healing' }],
      forceNonStreaming: true,
      providerHealingRequested: true,
    });

    expect(resolveOpenRouterStructuredChatExtrasForJob(surfaceId, {
      jsonSchemaResponseFormat: schema,
      requireJsonSchema: true,
      allowProviderHealing: false,
    })?.plugins).toBeUndefined();
  });

  it('returns null when strict json schema is required but bound config lacks structured outputs', () => {
    const surfaceId = 'studyQuestionExplain';
    const configId = studySettingsStore.getState().surfaceProviders[surfaceId].openRouterConfigId!;
    studySettingsStore.getState().updateOpenRouterConfig(configId, {
      supportedParameters: ['response_format'],
    });

    expect(resolveOpenRouterStructuredChatExtrasForJob(surfaceId, {
      requireJsonSchema: true,
      jsonSchemaResponseFormat: {
        type: 'json_schema',
        json_schema: {
          name: 'strict_payload',
          strict: true,
          schema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
        },
      },
    })).toBeNull();
  });

  it('does not expose browser settings for backend-owned generation pipeline surfaces', () => {
    expect(makeOpenRouterProviderSelector('topicContent')(studySettingsStore.getState())).toBe(false);
    expect(() => inferenceProviderForSurface('topicContent')).toThrow(
      "Generation pipeline surface 'topicContent' is backend-owned",
    );
    expect(() => resolveModelForSurface('crystalTrial')).toThrow(
      "Generation pipeline surface 'crystalTrial' is backend-owned",
    );
  });
});
