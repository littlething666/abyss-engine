import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveSubjectGenerationStageBindings } from './resolveSubjectGenerationStageBindings';

const topicsChat = { completeChat: vi.fn() };
const edgesChat = { completeChat: vi.fn() };

vi.mock('@/infrastructure/llmInferenceRegistry', () => ({
  getChatCompletionsRepositoryForSurface: (surfaceId: string) =>
    surfaceId === 'subjectGenerationTopics' ? topicsChat : edgesChat,
}));

vi.mock('@/infrastructure/llmInferenceSurfaceProviders', () => ({
  resolveModelForSurface: (surfaceId: string) =>
    surfaceId === 'subjectGenerationTopics' ? 'topics/model' : 'edges/model',
  resolveEnableStreamingForSurface: (surfaceId: string) =>
    surfaceId === 'subjectGenerationTopics',
  resolveEnableReasoningForSurface: (surfaceId: string) =>
    surfaceId === 'subjectGenerationEdges',
}));

describe('resolveSubjectGenerationStageBindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns distinct chat repos per surface', () => {
    const b = resolveSubjectGenerationStageBindings();
    expect(b.topics.chat).toBe(topicsChat);
    expect(b.edges.chat).toBe(edgesChat);
    expect(b.topics.chat).not.toBe(b.edges.chat);
  });

  it('uses resolved models and topics streaming from settings', () => {
    const b = resolveSubjectGenerationStageBindings();
    expect(b.topics.model).toBe('topics/model');
    expect(b.edges.model).toBe('edges/model');
    expect(b.topics.enableStreaming).toBe(true);
    expect(b.topics.enableReasoning).toBe(false);
    expect(b.edges.enableReasoning).toBe(true);
  });

  it('forces enableStreaming false for edges', () => {
    const b = resolveSubjectGenerationStageBindings();
    expect(b.edges.enableStreaming).toBe(false);
  });
});
