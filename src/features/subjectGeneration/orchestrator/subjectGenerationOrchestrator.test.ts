import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentGenerationJob } from '@/types/contentGeneration';
import type { SubjectGraph } from '@/types/core';
import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter } from '@/types/repository';

import { useContentGenerationStore } from '@/features/contentGeneration';
import { runContentGenerationJob } from '@/features/contentGeneration/runContentGenerationJob';

import { createSubjectGenerationOrchestrator } from './subjectGenerationOrchestrator';

vi.mock('@/features/contentGeneration/runContentGenerationJob', () => ({
  runContentGenerationJob: vi.fn(),
}));

function validFifteenNodeGraphJson(subjectId: string): string {
  const nodes: SubjectGraph['nodes'] = [];
  for (let i = 1; i <= 5; i += 1) {
    nodes.push({
      topicId: `t1-${i}`,
      title: `Tier 1 topic ${i}`,
      tier: 1,
      prerequisites: [],
      learningObjective: 'Objective one.',
    });
  }
  for (let i = 1; i <= 5; i += 1) {
    nodes.push({
      topicId: `t2-${i}`,
      title: `Tier 2 topic ${i}`,
      tier: 2,
      prerequisites: [`t1-${i}`],
      learningObjective: 'Objective two.',
    });
  }
  for (let i = 1; i <= 5; i += 1) {
    nodes.push({
      topicId: `t3-${i}`,
      title: `Tier 3 topic ${i}`,
      tier: 3,
      prerequisites: [`t2-${i}`, `t1-${i}`],
      learningObjective: 'Objective three.',
    });
  }
  const graph: SubjectGraph = {
    subjectId,
    title: 'Test curriculum',
    themeId: subjectId,
    maxTier: 3,
    nodes,
  };
  return JSON.stringify(graph);
}

function resetStore(): void {
  useContentGenerationStore.setState({
    jobs: {},
    pipelines: {},
    abortControllers: {},
    pipelineAbortControllers: {},
  });
}

const stubJob = {} as ContentGenerationJob;

describe('createSubjectGenerationOrchestrator', () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(runContentGenerationJob).mockReset();
  });

  it('registers pipeline, calls runContentGenerationJob with subject-graph, and persists on success', async () => {
    const subjectId = 'orch-test-subject';
    const raw = validFifteenNodeGraphJson(subjectId);
    const chat: IChatCompletionsRepository = {
      completeChat: vi.fn(),
      streamChat: vi.fn(),
    };

    const writer: IDeckContentWriter = {
      upsertSubject: vi.fn(async () => {}),
      upsertGraph: vi.fn(async () => {}),
      upsertTopicDetails: vi.fn(async () => {}),
      upsertTopicCards: vi.fn(async () => {}),
      appendTopicCards: vi.fn(),
    };

    vi.mocked(runContentGenerationJob).mockImplementation(async (params) => {
      const parsed = await params.parseOutput(raw, stubJob);
      if (!parsed.ok) {
        return { ok: false, jobId: 'j-mock', error: parsed.error };
      }
      await params.persistOutput(parsed.data, stubJob);
      return { ok: true, jobId: 'j-mock' };
    });

    const registerSpy = vi.spyOn(useContentGenerationStore.getState(), 'registerPipeline');

    const orch = createSubjectGenerationOrchestrator();
    const result = await orch.execute(
      { subjectId, checklist: { topicName: 'Orch test' } },
      { chat, writer, model: 'test-model' },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.nodes).toHaveLength(15);
    }

    expect(registerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'New subject: Orch test',
      }),
      expect.any(AbortController),
    );

    expect(runContentGenerationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'subject-graph',
        label: 'Curriculum — Orch test',
        subjectId,
        topicId: null,
        llmSurfaceId: 'subjectGeneration',
        pipelineId: expect.any(String),
        chat,
        model: 'test-model',
        enableThinking: false,
        externalSignal: expect.any(AbortSignal),
        metadata: { checklist: { topicName: 'Orch test' } },
      }),
    );

    expect(writer.upsertSubject).toHaveBeenCalled();
    expect(writer.upsertGraph).toHaveBeenCalled();
  });

  it('returns failure when runContentGenerationJob fails', async () => {
    const chat: IChatCompletionsRepository = {
      completeChat: vi.fn(),
      streamChat: vi.fn(),
    };
    const writer: IDeckContentWriter = {
      upsertSubject: vi.fn(),
      upsertGraph: vi.fn(),
      upsertTopicDetails: vi.fn(),
      upsertTopicCards: vi.fn(),
      appendTopicCards: vi.fn(),
    };

    vi.mocked(runContentGenerationJob).mockResolvedValue({ ok: false, jobId: 'j1', error: 'bad' });

    const orch = createSubjectGenerationOrchestrator();
    const result = await orch.execute(
      { subjectId: 'x', checklist: { topicName: 'Y' } },
      { chat, writer, model: 'm' },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('bad');
    }
    expect(writer.upsertGraph).not.toHaveBeenCalled();
  });
});
