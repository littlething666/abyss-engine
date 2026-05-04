import { beforeEach, describe, expect, it } from 'vitest';

import { studySettingsStore } from '@/store/studySettingsStore';
import {
  PIPELINE_INFERENCE_SURFACE_IDS,
  isPipelineInferenceSurfaceId,
} from '@/types/llmInference';
import {
  PipelineSurfaceConfigValidationError,
  assertPipelineSurfaceConfigValid,
  resolveEnableReasoningForSurface,
  resolveIncludeOpenRouterReasoningParam,
  resolveOpenRouterStructuredChatExtrasForJob,
  validatePipelineSurfaceConfig,
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

  // --- Phase 0 step 6: PIPELINE_INFERENCE_SURFACE_IDS + isPipelineInferenceSurfaceId ---

  describe('PIPELINE_INFERENCE_SURFACE_IDS + isPipelineInferenceSurfaceId', () => {
    it('contains exactly the four pipeline-bound surfaces', () => {
      expect([...PIPELINE_INFERENCE_SURFACE_IDS].sort()).toEqual([
        'crystalTrial',
        'subjectGenerationEdges',
        'subjectGenerationTopics',
        'topicContent',
      ]);
    });

    it('isPipelineInferenceSurfaceId returns true for each pipeline surface', () => {
      for (const surfaceId of PIPELINE_INFERENCE_SURFACE_IDS) {
        expect(isPipelineInferenceSurfaceId(surfaceId)).toBe(true);
      }
    });

    it('isPipelineInferenceSurfaceId returns false for the non-pipeline study surfaces', () => {
      expect(isPipelineInferenceSurfaceId('studyQuestionExplain')).toBe(false);
      expect(isPipelineInferenceSurfaceId('studyFormulaExplain')).toBe(false);
    });
  });

  // --- Phase 0 step 6: validatePipelineSurfaceConfig + assertPipelineSurfaceConfigValid ---

  describe('validatePipelineSurfaceConfig (Phase 0 step 6)', () => {
    it('returns ok=true for non-pipeline surfaces unconditionally, even on degenerate bindings', () => {
      studySettingsStore.setState({
        ...studySettingsStore.getState(),
        openRouterConfigs: [],
        surfaceProviders: {
          ...studySettingsStore.getState().surfaceProviders,
          studyQuestionExplain: { provider: 'openrouter', openRouterConfigId: 'missing' },
          studyFormulaExplain: { provider: 'local', openRouterConfigId: null },
        },
      });
      expect(validatePipelineSurfaceConfig('studyQuestionExplain')).toEqual({ ok: true });
      expect(validatePipelineSurfaceConfig('studyFormulaExplain')).toEqual({ ok: true });
    });

    it('rejects pipeline surface bound to local provider with config:invalid', () => {
      studySettingsStore.setState({
        ...studySettingsStore.getState(),
        surfaceProviders: {
          ...studySettingsStore.getState().surfaceProviders,
          topicContent: { provider: 'local', openRouterConfigId: null },
        },
      });
      const result = validatePipelineSurfaceConfig('topicContent');
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected failure');
      expect(result.code).toBe('config:invalid');
      expect(result.message).toContain('topicContent');
      expect(result.message).toContain('local provider');
    });

    it('rejects pipeline surface bound to OpenRouter without a config id with config:missing-model-binding', () => {
      studySettingsStore.setState({
        ...studySettingsStore.getState(),
        surfaceProviders: {
          ...studySettingsStore.getState().surfaceProviders,
          subjectGenerationTopics: { provider: 'openrouter', openRouterConfigId: null },
        },
      });
      const result = validatePipelineSurfaceConfig('subjectGenerationTopics');
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected failure');
      expect(result.code).toBe('config:missing-model-binding');
      expect(result.message).toContain('subjectGenerationTopics');
    });

    it('rejects pipeline surface bound to an unknown OpenRouter config id with config:missing-model-binding', () => {
      studySettingsStore.setState({
        ...studySettingsStore.getState(),
        openRouterConfigs: [
          {
            id: 'known-config',
            label: 'Known',
            model: 'org/model',
            enableReasoning: false,
            enableStreaming: true,
            supportedParameters: ['response_format', 'structured_outputs'],
          },
        ],
        surfaceProviders: {
          ...studySettingsStore.getState().surfaceProviders,
          crystalTrial: { provider: 'openrouter', openRouterConfigId: 'unknown-config' },
        },
      });
      const result = validatePipelineSurfaceConfig('crystalTrial');
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected failure');
      expect(result.code).toBe('config:missing-model-binding');
      expect(result.message).toContain('crystalTrial');
      expect(result.message).toContain('unknown-config');
    });

    it('rejects pipeline surface bound to a config without response_format with config:missing-structured-output', () => {
      studySettingsStore.setState({
        ...studySettingsStore.getState(),
        openRouterConfigs: [
          {
            id: 'tools-only',
            label: 'Tools only',
            model: 'org/model',
            enableReasoning: false,
            enableStreaming: true,
            supportedParameters: ['tools'],
          },
        ],
        surfaceProviders: {
          ...studySettingsStore.getState().surfaceProviders,
          subjectGenerationEdges: { provider: 'openrouter', openRouterConfigId: 'tools-only' },
        },
      });
      const result = validatePipelineSurfaceConfig('subjectGenerationEdges');
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected failure');
      expect(result.code).toBe('config:missing-structured-output');
      expect(result.message).toContain('response_format');
    });

    it('rejects pipeline surface bound to a json_object-only config (no structured_outputs) with config:missing-structured-output', () => {
      studySettingsStore.setState({
        ...studySettingsStore.getState(),
        openRouterConfigs: [
          {
            id: 'json-only',
            label: 'JSON-only',
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
      const result = validatePipelineSurfaceConfig('topicContent');
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected failure');
      expect(result.code).toBe('config:missing-structured-output');
      expect(result.message).toContain('structured_outputs');
    });

    it('returns ok=true when pipeline surface is bound to a schema-capable OpenRouter config', () => {
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
          subjectGenerationTopics: { provider: 'openrouter', openRouterConfigId: 'schema-capable' },
          subjectGenerationEdges: { provider: 'openrouter', openRouterConfigId: 'schema-capable' },
          crystalTrial: { provider: 'openrouter', openRouterConfigId: 'schema-capable' },
        },
      });
      for (const surfaceId of PIPELINE_INFERENCE_SURFACE_IDS) {
        expect(validatePipelineSurfaceConfig(surfaceId)).toEqual({ ok: true });
      }
    });
  });

  describe('assertPipelineSurfaceConfigValid (Phase 0 step 6)', () => {
    it('throws PipelineSurfaceConfigValidationError carrying surfaceId + code on missing structured_outputs', () => {
      studySettingsStore.setState({
        ...studySettingsStore.getState(),
        openRouterConfigs: [
          {
            id: 'json-only',
            label: 'JSON-only',
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

      let caught: unknown;
      try {
        assertPipelineSurfaceConfigValid('topicContent');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(PipelineSurfaceConfigValidationError);
      const err = caught as PipelineSurfaceConfigValidationError;
      expect(err.code).toBe('config:missing-structured-output');
      expect(err.surfaceId).toBe('topicContent');
      expect(err.name).toBe('PipelineSurfaceConfigValidationError');
    });

    it('throws PipelineSurfaceConfigValidationError with config:invalid when pipeline surface is bound to local', () => {
      studySettingsStore.setState({
        ...studySettingsStore.getState(),
        surfaceProviders: {
          ...studySettingsStore.getState().surfaceProviders,
          crystalTrial: { provider: 'local', openRouterConfigId: null },
        },
      });
      expect(() => assertPipelineSurfaceConfigValid('crystalTrial')).toThrow(
        PipelineSurfaceConfigValidationError,
      );
    });

    it('does not throw for non-pipeline surfaces, regardless of binding', () => {
      studySettingsStore.setState({
        ...studySettingsStore.getState(),
        openRouterConfigs: [],
        surfaceProviders: {
          ...studySettingsStore.getState().surfaceProviders,
          studyQuestionExplain: { provider: 'openrouter', openRouterConfigId: 'missing' },
          studyFormulaExplain: { provider: 'local', openRouterConfigId: null },
        },
      });
      expect(() => assertPipelineSurfaceConfigValid('studyQuestionExplain')).not.toThrow();
      expect(() => assertPipelineSurfaceConfigValid('studyFormulaExplain')).not.toThrow();
    });

    it('does not throw when pipeline surface is bound to a schema-capable OpenRouter config', () => {
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
      expect(() => assertPipelineSurfaceConfigValid('topicContent')).not.toThrow();
    });
  });
});
