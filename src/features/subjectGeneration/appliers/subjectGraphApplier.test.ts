/**
 * Tests for `subjectGraphApplier` — Phase 0.5 step 5.
 */

import { describe, it, expect, vi } from 'vitest';

import { createSubjectGraphApplier } from './subjectGraphApplier';
import type {
  ArtifactApplyContext,
  AppliedArtifactsStore,
} from '@/features/generationContracts/artifacts/applier';
import type { IDeckContentWriter, IDeckRepository } from '@/types/repository';
import type { SubjectGraph, TopicIconName } from '@/types/core';

function makeMockDedupeStore(): AppliedArtifactsStore & { records: Map<string, { kind: string; appliedAt: number }> } {
  const records = new Map<string, { kind: string; appliedAt: number }>();
  return {
    records,
    async has(contentHash) { return records.has(contentHash); },
    async record(contentHash, kind, appliedAt) { records.set(contentHash, { kind, appliedAt }); },
    async getLatestTopicExpansionScope() { return null; },
  };
}

function makeContext(overrides?: Partial<ArtifactApplyContext>): ArtifactApplyContext {
  return {
    runId: 'run-1',
    deviceId: 'device-1',
    now: () => 1000,
    dedupeStore: makeMockDedupeStore(),
    subjectId: 'sub-a',
    ...overrides,
  };
}

type SGArtifactEnvelope = Parameters<ReturnType<typeof createSubjectGraphApplier>['apply']>[0];

function topicsEnvelope(topics: Array<Record<string, unknown>>, contentHash?: string): SGArtifactEnvelope {
  return {
    kind: 'inline',
    artifact: {
      id: 'art-1',
      kind: 'subject-graph-topics',
      contentHash: contentHash ?? 'cnt_sg1',
      inputHash: 'inp_sg1',
      schemaVersion: 1,
      createdByRunId: 'run-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload: { topics },
    },
  } as unknown as SGArtifactEnvelope;
}

function edgesEnvelope(edges: Array<{ source: string; target: string; minLevel?: number }>, contentHash?: string): SGArtifactEnvelope {
  return {
    kind: 'inline',
    artifact: {
      id: 'art-2',
      kind: 'subject-graph-edges',
      contentHash: contentHash ?? 'cnt_sg2',
      inputHash: 'inp_sg2',
      schemaVersion: 1,
      createdByRunId: 'run-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload: { edges },
    },
  } as unknown as SGArtifactEnvelope;
}

function signedUrlEnvelope(): SGArtifactEnvelope {
  return {
    kind: 'signed-url',
    meta: {
      id: 'art-1',
      kind: 'subject-graph-topics',
      contentHash: 'cnt_x',
      inputHash: 'inp_x',
      schemaVersion: 1,
      createdByRunId: 'run-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload: {},
    },
    url: 'https://example.com',
    expiresAt: '2026-01-02T00:00:00.000Z',
  } as unknown as SGArtifactEnvelope;
}

const existingGraph: SubjectGraph = {
  subjectId: 'sub-a',
  title: 'Existing Graph',
  themeId: 'default',
  maxTier: 3,
  nodes: [
    {
      topicId: 'top-existing',
      title: 'Existing Topic',
      iconName: 'terminal' as TopicIconName,
      tier: 1,
      learningObjective: 'Learn existing',
      prerequisites: [],
    },
  ],
};

function makeBasicGraph(overrides?: Partial<SubjectGraph>): SubjectGraph {
  return {
    subjectId: 'sub-a',
    title: 'Graph',
    themeId: 'default',
    maxTier: 3,
    nodes: [
      {
        topicId: 'top-1',
        title: 'Topic 1',
        iconName: 'terminal' as TopicIconName,
        tier: 1,
        learningObjective: 'Learn 1',
        prerequisites: [],
      },
      {
        topicId: 'top-2',
        title: 'Topic 2',
        iconName: 'code' as TopicIconName,
        tier: 2,
        learningObjective: 'Learn 2',
        prerequisites: [],
      },
    ],
    ...overrides,
  };
}

describe('subjectGraphApplier', () => {
  it('returns duplicate when contentHash already applied (Stage A)', async () => {
    const store = makeMockDedupeStore();
    await store.record('cnt_sg1', 'subject-graph-topics', 500);
    const applier = createSubjectGraphApplier({
      deckWriter: {} as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const result = await applier.apply(
      topicsEnvelope([], 'cnt_sg1'),
      makeContext({ dedupeStore: store }),
    );
    expect(result).toEqual({ applied: false, reason: 'duplicate' });
  });

  it('returns invalid for signed-url envelope', async () => {
    const applier = createSubjectGraphApplier({
      deckWriter: {} as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const result = await applier.apply(signedUrlEnvelope(), makeContext());
    expect(result).toEqual({ applied: false, reason: 'invalid' });
  });

  it('applies Stage A topics → upsertGraph with new nodes', async () => {
    const upsertGraph = vi.fn();
    const getSubjectGraph = vi.fn().mockRejectedValue(new Error('not found'));
    const applier = createSubjectGraphApplier({
      deckWriter: { upsertGraph } as unknown as IDeckContentWriter,
      deckRepository: { getSubjectGraph, getManifest: vi.fn() } as unknown as IDeckRepository,
    });

    const result = await applier.apply(
      topicsEnvelope([
        {
          topicId: 'top-new',
          title: 'New Topic',
          iconName: 'terminal' as TopicIconName,
          tier: 1,
          learningObjective: 'Learn new topic',
        },
      ]),
      makeContext(),
    );

    expect(result).toEqual({ applied: true });
    expect(upsertGraph).toHaveBeenCalledOnce();
    const graphArg = upsertGraph.mock.calls[0][0] as SubjectGraph;
    expect(graphArg.nodes).toHaveLength(1);
    expect(graphArg.nodes[0]).toMatchObject({
      topicId: 'top-new',
      title: 'New Topic',
      tier: 1,
      learningObjective: 'Learn new topic',
    });
  });

  it('Stage A merges with existing graph nodes', async () => {
    const upsertGraph = vi.fn();
    const getSubjectGraph = vi.fn().mockResolvedValue(existingGraph);
    const applier = createSubjectGraphApplier({
      deckWriter: { upsertGraph } as unknown as IDeckContentWriter,
      deckRepository: { getSubjectGraph } as unknown as IDeckRepository,
    });

    const result = await applier.apply(
      topicsEnvelope([
        {
          topicId: 'top-new',
          title: 'New Topic',
          iconName: 'code' as TopicIconName,
          tier: 2,
          learningObjective: 'Learn new topic',
        },
      ]),
      makeContext(),
    );

    expect(result).toEqual({ applied: true });
    const graphArg = upsertGraph.mock.calls[0][0] as SubjectGraph;
    expect(graphArg.nodes).toHaveLength(2);
    expect(graphArg.nodes.find((n) => n.topicId === 'top-existing')).toBeTruthy();
    expect(graphArg.maxTier).toBe(3);
    expect(graphArg.title).toBe('Existing Graph');
    expect(graphArg.themeId).toBe('default');
  });

  it('Stage B without Stage A applied returns missing-stage-a', async () => {
    const applier = createSubjectGraphApplier({
      deckWriter: {} as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const result = await applier.apply(
      edgesEnvelope([{ source: 'top-1', target: 'top-2' }]),
      makeContext(),
    );
    expect(result).toEqual({ applied: false, reason: 'missing-stage-a' });
  });

  it('applies Stage B edges after Stage A → upsertGraph with prerequisites', async () => {
    const store = makeMockDedupeStore();
    const upsertGraph = vi.fn().mockImplementation((g: SubjectGraph) => g);
    const getSubjectGraph = vi.fn().mockResolvedValue(makeBasicGraph());

    // Apply Stage A first
    const stageADeps = {
      deckWriter: { upsertGraph: vi.fn() } as unknown as IDeckContentWriter,
      deckRepository: {
        getSubjectGraph: vi.fn().mockRejectedValue(new Error('not found')),
      } as unknown as IDeckRepository,
    };
    const stageAApplier = createSubjectGraphApplier(stageADeps);
    await stageAApplier.apply(
      topicsEnvelope([
        { topicId: 'top-1', title: 'Topic 1', iconName: 'terminal' as TopicIconName, tier: 1, learningObjective: 'Learn 1' },
        { topicId: 'top-2', title: 'Topic 2', iconName: 'code' as TopicIconName, tier: 2, learningObjective: 'Learn 2' },
      ], 'cnt_stage_a'),
      makeContext({ dedupeStore: store }),
    );

    const applier = createSubjectGraphApplier({
      deckWriter: { upsertGraph } as unknown as IDeckContentWriter,
      deckRepository: { getSubjectGraph } as unknown as IDeckRepository,
    });
    const result = await applier.apply(
      edgesEnvelope([{ source: 'top-1', target: 'top-2' }]),
      makeContext({
        dedupeStore: store,
        subjectGraphLatticeContentHash: 'cnt_stage_a',
      }),
    );

    expect(result).toEqual({ applied: true });
    const graphArg = upsertGraph.mock.calls[0][0] as SubjectGraph;
    expect(graphArg.nodes).toHaveLength(2);
    const targetNode = graphArg.nodes.find((n) => n.topicId === 'top-2')!;
    expect(targetNode.prerequisites).toEqual(['top-1']);
  });

  it('Stage B sets minLevel on prerequisites when specified', async () => {
    const store = makeMockDedupeStore();
    const upsertGraph = vi.fn();
    const getSubjectGraph = vi.fn().mockResolvedValue(makeBasicGraph({ nodes: [makeBasicGraph().nodes[0]] }));

    const stageADeps = {
      deckWriter: { upsertGraph: vi.fn() } as unknown as IDeckContentWriter,
      deckRepository: {
        getSubjectGraph: vi.fn().mockRejectedValue(new Error('not found')),
      } as unknown as IDeckRepository,
    };
    await createSubjectGraphApplier(stageADeps).apply(
      topicsEnvelope([
        { topicId: 'top-1', title: 'Topic 1', iconName: 'terminal' as TopicIconName, tier: 1, learningObjective: 'Learn 1' },
      ], 'cnt_stage_a2'),
      makeContext({ dedupeStore: store }),
    );

    const applier = createSubjectGraphApplier({
      deckWriter: { upsertGraph } as unknown as IDeckContentWriter,
      deckRepository: { getSubjectGraph } as unknown as IDeckRepository,
    });
    await applier.apply(
      edgesEnvelope([{ source: 'top-1', target: 'top-1', minLevel: 2 }]),
      makeContext({
        dedupeStore: store,
        subjectGraphLatticeContentHash: 'cnt_stage_a2',
      }),
    );

    const graphArg = upsertGraph.mock.calls[0][0] as SubjectGraph;
    const targetNode = graphArg.nodes.find((n) => n.topicId === 'top-1')!;
    expect(targetNode.prerequisites).toEqual([{ topicId: 'top-1', minLevel: 2 }]);
  });

  it('returns invalid for unknown artifact kind', async () => {
    const applier = createSubjectGraphApplier({
      deckWriter: {} as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const result = await applier.apply(
      {
        kind: 'inline',
        artifact: {
          id: 'art-99',
          kind: 'topic-theory',
          contentHash: 'cnt_th',
          inputHash: 'inp_th',
          schemaVersion: 1,
          createdByRunId: 'run-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          payload: { coreConcept: 'C', theory: 'T', keyTakeaways: ['a', 'b', 'c', 'd'], coreQuestionsByDifficulty: { '1': ['q'], '2': ['q'], '3': ['q'], '4': ['q'] } },
        },
      } as unknown as SGArtifactEnvelope,
      makeContext(),
    );
    expect(result).toEqual({ applied: false, reason: 'invalid' });
  });

  it('Stage B returns missing-stage-a when lattice hash is absent from dedupe', async () => {
    const applier = createSubjectGraphApplier({
      deckWriter: {} as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const result = await applier.apply(
      edgesEnvelope([{ source: 'top-1', target: 'top-2' }]),
      makeContext({ subjectGraphLatticeContentHash: 'cnt_missing_from_store' }),
    );
    expect(result).toEqual({ applied: false, reason: 'missing-stage-a' });
  });

  it('applies Stage B when Stage A was duplicate but lattice hash is in dedupe store', async () => {
    const store = makeMockDedupeStore();
    await store.record('cnt_stage_persisted', 'subject-graph-topics', 500);
    const upsertGraph = vi.fn();
    const getSubjectGraph = vi.fn().mockResolvedValue(makeBasicGraph());
    const applier = createSubjectGraphApplier({
      deckWriter: { upsertGraph } as unknown as IDeckContentWriter,
      deckRepository: { getSubjectGraph } as unknown as IDeckRepository,
    });
    const result = await applier.apply(
      edgesEnvelope([{ source: 'top-1', target: 'top-2' }]),
      makeContext({
        dedupeStore: store,
        subjectGraphLatticeContentHash: 'cnt_stage_persisted',
      }),
    );
    expect(result).toEqual({ applied: true });
    expect(upsertGraph).toHaveBeenCalledOnce();
  });

  it('returns invalid when subjectId is missing', async () => {
    const applier = createSubjectGraphApplier({
      deckWriter: {} as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const result = await applier.apply(
      topicsEnvelope([
        { topicId: 'top-1', title: 'T', iconName: 'terminal' as TopicIconName, tier: 1, learningObjective: 'L' },
      ]),
      makeContext({ subjectId: undefined }),
    );
    expect(result).toEqual({ applied: false, reason: 'invalid' });
  });
});
