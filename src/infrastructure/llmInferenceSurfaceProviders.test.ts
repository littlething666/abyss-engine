import { beforeEach, describe, expect, it } from 'vitest';

import { studySettingsStore } from '@/store/studySettingsStore';
import {
  resolveEnableReasoningForSurface,
  resolveIncludeOpenRouterReasoningParam,
  resolveOpenRouterStructuredChatExtrasForJob,
} from './llmInferenceSurfaceProviders';

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

  const dummyJsonSchemaFormat = {
    type: 'json_schema' as const,
    json_schema: {
      name: 'topic_theory_syllabus',
      strict: true,
      schema: { type: 'object' },
    },
  };

  it('selects JSON Schema response_format when structured_outputs is supported', () => {
    studySettingsStore.setState({
      ...studySettingsStore.getState(),
      openRouterConfigs: [
        {
          id: 'schema-capable',
          label: 'Schema',
          model: 'org/model',
          enableReasoning: false,
          enableStreaming: true,
          supportedParameters: ['response_format', 'structured_outputs'],
        },
      ],
      surfaceProviders: {
        ...studySettingsStore.getState().surfaceProviders,
        topicContent: { provider: 'openrouter', openRouterConfigId: 'schema-capable' },
      },
    });

    const out = resolveOpenRouterStructuredChatExtrasForJob('topicContent', {
      jsonSchemaResponseFormat: dummyJsonSchemaFormat,
    });
    expect(out?.responseFormat).toEqual(dummyJsonSchemaFormat);
    expect(out?.forceNonStreaming).toBe(true);
  });

  it('attaches response-healing plugin for JSON Schema mode when OpenRouter healing is enabled', () => {
    studySettingsStore.setState({
      ...studySettingsStore.getState(),
      openRouterResponseHealing: true,
      openRouterConfigs: [
        {
          id: 'schema-capable',
          label: 'Schema',
          model: 'org/model',
          enableReasoning: false,
          enableStreaming: true,
          supportedParameters: ['response_format', 'structured_outputs'],
        },
      ],
      surfaceProviders: {
        ...studySettingsStore.getState().surfaceProviders,
        topicContent: { provider: 'openrouter', openRouterConfigId: 'schema-capable' },
      },
    });

    const out = resolveOpenRouterStructuredChatExtrasForJob('topicContent', {
      jsonSchemaResponseFormat: dummyJsonSchemaFormat,
    });
    expect(out?.plugins).toEqual([{ id: 'response-healing' }]);
  });

  it('falls back to json_object when structured_outputs is absent but response_format is supported', () => {
    studySettingsStore.setState({
      ...studySettingsStore.getState(),
      openRouterConfigs: [
        {
          id: 'json-only',
          label: 'JSON',
          model: 'org/model',
          enableReasoning: false,
          enableStreaming: true,
          supportedParameters: ['response_format'],
        },
      ],
      surfaceProviders: {
        ...studySettingsStore.getState().surfaceProviders,
        topicContent: { provider: 'openrouter', openRouterConfigId: 'json-only' },
      },
    });

    const out = resolveOpenRouterStructuredChatExtrasForJob('topicContent', {
      jsonSchemaResponseFormat: dummyJsonSchemaFormat,
    });
    expect(out?.responseFormat).toEqual({ type: 'json_object' });
  });

  it('returns null for structured extras when response_format is not a supported parameter', () => {
    studySettingsStore.setState({
      ...studySettingsStore.getState(),
      openRouterConfigs: [
        {
          id: 'no-response-format',
          label: 'Bare',
          model: 'org/model',
          enableReasoning: false,
          enableStreaming: true,
          supportedParameters: ['tools'],
        },
      ],
      surfaceProviders: {
        ...studySettingsStore.getState().surfaceProviders,
        topicContent: { provider: 'openrouter', openRouterConfigId: 'no-response-format' },
      },
    });

    expect(
      resolveOpenRouterStructuredChatExtrasForJob('topicContent', {
        jsonSchemaResponseFormat: dummyJsonSchemaFormat,
      }),
    ).toBeNull();
  });

  // --- Phase 0 step 5: requireJsonSchema / allowProviderHealing options ---

  it('requireJsonSchema=true returns JSON Schema extras when structured_outputs is supported', () => {
    studySettingsStore.setState({
      ...studySettingsStore.getState(),
      openRouterConfigs: [
        {
          id: 'schema-capable',
          label: 'Schema',
          model: 'org/model',
          enableReasoning: false,
          enableStreaming: true,
          supportedParameters: ['response_format', 'structured_outputs'],
        },
      ],
      surfaceProviders: {
        ...studySettingsStore.getState().surfaceProviders,
        topicContent: { provider: 'openrouter', openRouterConfigId: 'schema-capable' },
      },
    });

    const out = resolveOpenRouterStructuredChatExtrasForJob('topicContent', {
      jsonSchemaResponseFormat: dummyJsonSchemaFormat,
      requireJsonSchema: true,
      allowProviderHealing: true,
    });
    expect(out?.responseFormat).toEqual(dummyJsonSchemaFormat);
    expect(out?.forceNonStreaming).toBe(true);
  });

  it('requireJsonSchema=true returns null (no json_object fallback) when structured_outputs is absent', () => {
    studySettingsStore.setState({
      ...studySettingsStore.getState(),
      openRouterConfigs: [
        {
          id: 'json-only',
          label: 'JSON',
          model: 'org/model',
          enableReasoning: false,
          enableStreaming: true,
          supportedParameters: ['response_format'],
        },
      ],
      surfaceProviders: {
        ...studySettingsStore.getState().surfaceProviders,
        topicContent: { provider: 'openrouter', openRouterConfigId: 'json-only' },
      },
    });

    const out = resolveOpenRouterStructuredChatExtrasForJob('topicContent', {
      jsonSchemaResponseFormat: dummyJsonSchemaFormat,
      requireJsonSchema: true,
    });
    expect(out).toBeNull();
  });

  it('requireJsonSchema=true returns null when no jsonSchemaResponseFormat is supplied even on schema-capable config', () => {
    studySettingsStore.setState({
      ...studySettingsStore.getState(),
      openRouterConfigs: [
        {
          id: 'schema-capable',
          label: 'Schema',
          model: 'org/model',
          enableReasoning: false,
          enableStreaming: true,
          supportedParameters: ['response_format', 'structured_outputs'],
        },
      ],
      surfaceProviders: {
        ...studySettingsStore.getState().surfaceProviders,
        topicContent: { provider: 'openrouter', openRouterConfigId: 'schema-capable' },
      },
    });

    const out = resolveOpenRouterStructuredChatExtrasForJob('topicContent', {
      requireJsonSchema: true,
    });
    expect(out).toBeNull();
  });

  it('allowProviderHealing=false suppresses the response-healing plugin even when the store enables it', () => {
    studySettingsStore.setState({
      ...studySettingsStore.getState(),
      openRouterResponseHealing: true,
      openRouterConfigs: [
        {
          id: 'schema-capable',
          label: 'Schema',
          model: 'org/model',
          enableReasoning: false,
          enableStreaming: true,
          supportedParameters: ['response_format', 'structured_outputs'],
        },
      ],
      surfaceProviders: {
        ...studySettingsStore.getState().surfaceProviders,
        topicContent: { provider: 'openrouter', openRouterConfigId: 'schema-capable' },
      },
    });

    const out = resolveOpenRouterStructuredChatExtrasForJob('topicContent', {
      jsonSchemaResponseFormat: dummyJsonSchemaFormat,
      requireJsonSchema: true,
      allowProviderHealing: false,
    });
    expect(out?.responseFormat).toEqual(dummyJsonSchemaFormat);
    expect(out?.plugins).toBeUndefined();
  });

  it('allowProviderHealing=true (explicit) preserves the response-healing plugin when the store enables it', () => {
    studySettingsStore.setState({
      ...studySettingsStore.getState(),
      openRouterResponseHealing: true,
      openRouterConfigs: [
        {
          id: 'schema-capable',
          label: 'Schema',
          model: 'org/model',
          enableReasoning: false,
          enableStreaming: true,
          supportedParameters: ['response_format', 'structured_outputs'],
        },
      ],
      surfaceProviders: {
        ...studySettingsStore.getState().surfaceProviders,
        topicContent: { provider: 'openrouter', openRouterConfigId: 'schema-capable' },
      },
    });

    const out = resolveOpenRouterStructuredChatExtrasForJob('topicContent', {
      jsonSchemaResponseFormat: dummyJsonSchemaFormat,
      requireJsonSchema: true,
      allowProviderHealing: true,
    });
    expect(out?.plugins).toEqual([{ id: 'response-healing' }]);
  });

  it('allowProviderHealing=false yields no plugins when the store also has healing disabled', () => {
    studySettingsStore.setState({
      ...studySettingsStore.getState(),
      openRouterResponseHealing: false,
      openRouterConfigs: [
        {
          id: 'schema-capable',
          label: 'Schema',
          model: 'org/model',
          enableReasoning: false,
          enableStreaming: true,
          supportedParameters: ['response_format', 'structured_outputs'],
        },
      ],
      surfaceProviders: {
        ...studySettingsStore.getState().surfaceProviders,
        topicContent: { provider: 'openrouter', openRouterConfigId: 'schema-capable' },
      },
    });

    const out = resolveOpenRouterStructuredChatExtrasForJob('topicContent', {
      jsonSchemaResponseFormat: dummyJsonSchemaFormat,
      requireJsonSchema: true,
      allowProviderHealing: false,
    });
    expect(out?.plugins).toBeUndefined();
  });
});
