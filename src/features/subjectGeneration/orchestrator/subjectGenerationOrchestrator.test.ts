import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentGenerationJob } from '@/types/contentGeneration';
import type { SubjectGraph } from '@/types/core';
import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter } from '@/types/repository';

import { useContentGenerationStore } from '@/features/contentGeneration';
import { runContentGenerationJob } from '@/features/contentGeneration/runContentGenerationJob';
import { appEventBus } from '@/infrastructure/eventBus';

import { createSubjectGenerationOrchestrator } from './subjectGenerationOrchestrator';
import type { GenerationDependencies } from './types';

vi.mock('@/features/contentGeneration/runContentGenerationJob', () => ({
  runContentGenerationJob: vi.fn(),
}));

function validFifteenNodeGraph(subjectId: string): SubjectGraph {
  const nodes: SubjectGraph['nodes'] = [];
  for (let i = 1; i <= 5; i += 1) {
    nodes.push({
      topicId: `t1-${i}`,
      title: `Tier 1 topic ${i}`,
      tier: 1,
      prerequisites: [],
      learningObjective: 'Objective one.',
      iconName: 'lightbulb',
    });
  }
  for (let i = 1; i <= 5; i += 1) {
    nodes.push({
      topicId: `t2-${i}`,
      title: `Tier 2 topic ${i}`,
      tier: 2,
      prerequisites: [`t1-${i}`],
      learningObjective: 'Objective two.',
      iconName: 'lightbulb',
    });
  }
  for (let i = 1; i <= 5; i += 1) {
    nodes.push({
      topicId: `t3-${i}`,
      title: `Tier 3 topic ${i}`,
      tier: 3,
      prerequisites: [`t2-${i}`, `t1-${i}`],
      learningObjective: 'Objective three.',
      iconName: 'lightbulb',
    });
  }
  return {
    subjectId,
    title: 'Test curriculum',
    themeId: subjectId,
    maxTier: 3,
    nodes,
  };
}

function latticeJsonFromGraph(graph: SubjectGraph): string {
  return JSON.stringify({
    topics: graph.nodes.map(({ topicId, title, tier, learningObjective, iconName }) => ({
      topicId,
      title,
      tier,
      learningObjective,
      iconName,
    })),
  });
}

function edgesJsonFromGraph(graph: SubjectGraph): string {
  const edges: Record<string, SubjectGraph['nodes'][0]['prerequisites']> = {};
  for (const n of graph.nodes) {
    if (n.tier > 1) edges[n.topicId] = n.prerequisites;
  }
  return JSON.stringify({ edges });
}

function resetStore(): void {
  useContentGenerationStore.setState({
    jobs: {},
    pipelines: {},
    abortControllers: {},
    pipelineAbortControllers: {},
  });
}

function makeDeps(
  chat: IChatCompletionsRepository,
  writer: IDeckContentWriter,
  options?: {
    topicsModel?: string;
    edgesModel?: string;
  },
): GenerationDependencies {
  const topicsModel = options?.topicsModel ?? 'test-topics';
  const edgesModel = options?.edgesModel ?? 'test-edges';
  return {
    stageBindings: {
      topics: {
        chat,
        model: topicsModel,
        enableStreaming: true,
        enableReasoning: false,
      },
      edges: {
        chat,
        model: edgesModel,
        enableStreaming: false,
        enableReasoning: false,
      },
    },
    writer,
  };
}

function makeWriter(): IDeckContentWriter {
  return {
    upsertSubject: vi.fn(async () => {}),
    upsertGraph: vi.fn(async () => {}),
    upsertTopicDetails: vi.fn(async () => {}),
    upsertTopicCards: vi.fn(async () => {}),
    appendTopicCards: vi.fn(),
  } as unknown as IDeckContentWriter;
}

function makeChat(): IChatCompletionsRepository {
  return {
    completeChat: vi.fn(),
    streamChat: vi.fn(),
  } as unknown as IChatCompletionsRepository;
}

const stubJob = {} as ContentGenerationJob;

describe('createSubjectGenerationOrchestrator', () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(runContentGenerationJob).mockReset();
  });

  it('registers pipeline, runs topics then edges jobs, and persists on success', async () => {
    const subjectId = 'orch-test-subject';
    const graph = validFifteenNodeGraph(subjectId);
    const rawLattice = latticeJsonFromGraph(graph);
    const rawEdges = edgesJsonFromGraph(graph);
    const chat = makeChat();
    const writer = makeWriter();

    vi.mocked(runContentGenerationJob).mockImplementation(async (params) => {
      if (params.kind === 'subject-graph-topics') {
        const parsed = await params.parseOutput(rawLattice, stubJob);
        if (!parsed.ok) {
          return { ok: false, jobId: 'j-topics', error: parsed.error };
        }
        await params.persistOutput(parsed.data, stubJob);
        return { ok: true, jobId: 'j-topics' };
      }
      if (params.kind === 'subject-graph-edges') {
        const parsed = await params.parseOutput(rawEdges, stubJob);
        if (!parsed.ok) {
          return { ok: false, jobId: 'j-edges', error: parsed.error };
        }
        await params.persistOutput(parsed.data, stubJob);
        return { ok: true, jobId: 'j-edges' };
      }
      return { ok: false, jobId: 'j-x', error: 'unexpected kind' };
    });

    const registerSpy = vi.spyOn(useContentGenerationStore.getState(), 'registerPipeline');

    const orch = createSubjectGenerationOrchestrator();
    const result = await orch.execute(
      { subjectId, checklist: { topicName: 'Orch test' } },
      makeDeps(chat, writer, { topicsModel: 'test-model', edgesModel: 'test-model' }),
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

    expect(runContentGenerationJob).toHaveBeenCalledTimes(2);
    expect(runContentGenerationJob).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: 'subject-graph-topics',
        label: '[Topics] Curriculum — Orch test',
        subjectId,
        topicId: null,
        llmSurfaceId: 'subjectGenerationTopics',
        pipelineId: expect.any(String),
        chat,
        model: 'test-model',
        enableReasoning: false,
        enableStreaming: true,
        externalSignal: expect.any(AbortSignal),
        failureDebugContext: {
          topicLabel: 'Orch test',
          pipelineStage: 'subject-graph',
          failedStage: 'topics',
        },
        metadata: { checklist: { topicName: 'Orch test' }, retryCount: 0 },
      }),
    );
    expect(runContentGenerationJob).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: 'subject-graph-edges',
        label: '[Edges] Curriculum — Orch test',
        enableStreaming: false,
        llmSurfaceId: 'subjectGenerationEdges',
        model: 'test-model',
        temperature: 0.1,
        failureDebugContext: {
          topicLabel: 'Orch test',
          pipelineStage: 'subject-graph',
          failedStage: 'edges',
        },
        metadata: { checklist: { topicName: 'Orch test' }, retryCount: 0 },
      }),
    );

    expect(writer.upsertSubject).toHaveBeenCalled();
    expect(writer.upsertGraph).toHaveBeenCalled();
  });

  it('returns failure when first-stage job fails', async () => {
    const chat = makeChat();
    const writer = makeWriter();

    vi.mocked(runContentGenerationJob).mockResolvedValue({ ok: false, jobId: 'j1', error: 'topics bad' });

    const orch = createSubjectGenerationOrchestrator();
    const result = await orch.execute({ subjectId: 'x', checklist: { topicName: 'Y' } }, makeDeps(chat, writer));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('topics bad');
      expect(result.pipelineId).toBeDefined();
      expect(result.stage).toBe('topics');
    }
    expect(writer.upsertGraph).not.toHaveBeenCalled();
    expect(runContentGenerationJob).toHaveBeenCalledTimes(1);
  });
});

describe('createSubjectGenerationOrchestrator \u2014 terminal failure events', () => {
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetStore();
    vi.mocked(runContentGenerationJob).mockReset();
    emitSpy = vi.spyOn(appEventBus, 'emit');
  });

  afterEach(() => {
    emitSpy.mockRestore();
  });

  it('emits subject-graph:generation-failed with stage=topics on first-stage failure', async () => {
    const chat = makeChat();
    const writer = makeWriter();

    vi.mocked(runContentGenerationJob).mockResolvedValueOnce({
      ok: false,
      jobId: 'j-topics',
      error: 'topics bad',
    });

    const orch = createSubjectGenerationOrchestrator();
    await orch.execute(
      { subjectId: 'sub-fail-1', checklist: { topicName: 'Topology' } },
      makeDeps(chat, writer),
    );

    expect(emitSpy).toHaveBeenCalledWith(
      'subject-graph:generation-failed',
      expect.objectContaining({
        subjectId: 'sub-fail-1',
        subjectName: 'Topology',
        stage: 'topics',
        error: 'topics bad',
        pipelineId: expect.any(String),
      }),
    );
  });

  it('emits subject-graph:generation-failed with stage=edges when topics succeed but edges fail', async () => {
    const subjectId = 'sub-fail-2';
    const graph = validFifteenNodeGraph(subjectId);
    const rawLattice = latticeJsonFromGraph(graph);
    const chat = makeChat();
    const writer = makeWriter();

    vi.mocked(runContentGenerationJob).mockImplementation(async (params) => {
      if (params.kind === 'subject-graph-topics') {
        const parsed = await params.parseOutput(rawLattice, stubJob);
        if (!parsed.ok) return { ok: false, jobId: 'j-t', error: parsed.error };
        await params.persistOutput(parsed.data, stubJob);
        return { ok: true, jobId: 'j-t' };
      }
      return { ok: false, jobId: 'j-e', error: 'edges bad' };
    });

    const orch = createSubjectGenerationOrchestrator();
    await orch.execute(
      { subjectId, checklist: { topicName: 'Edges Topic' } },
      makeDeps(chat, writer),
    );

    expect(emitSpy).toHaveBeenCalledWith(
      'subject-graph:generation-failed',
      expect.objectContaining({
        subjectId,
        subjectName: 'Edges Topic',
        stage: 'edges',
        error: 'edges bad',
      }),
    );
  });

  it('falls back to subjectId for subjectName when checklist topicName is whitespace', async () => {
    const chat = makeChat();
    const writer = makeWriter();

    vi.mocked(runContentGenerationJob).mockResolvedValueOnce({
      ok: false,
      jobId: 'j-t',
      error: 'topics bad',
    });

    const orch = createSubjectGenerationOrchestrator();
    await orch.execute(
      { subjectId: 'sub-fall-back', checklist: { topicName: '   ' } },
      makeDeps(chat, writer),
    );

    expect(emitSpy).toHaveBeenCalledWith(
      'subject-graph:generation-failed',
      expect.objectContaining({ subjectName: 'sub-fall-back' }),
    );
  });
});
