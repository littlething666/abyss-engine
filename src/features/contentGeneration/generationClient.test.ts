import { describe, expect, it, vi } from 'vitest';

import type { RunEvent, TopicTheoryRunInputSnapshot } from '@/features/generationContracts';
import { inputHash } from '@/features/generationContracts';
import type { IGenerationRunRepository, RunInput, RunSnapshot } from '@/types/repository';

import { createGenerationClient } from './generationClient';

const ENVELOPE = {
  schemaVersion: 1,
  promptTemplateVersion: 'v1',
  modelId: 'openai/gpt-4o-mini',
  capturedAt: '2026-05-04T00:00:00.000Z',
} as const;

const VALID_CONTENT_HASH =
  'cnt_0000000000000000000000000000000000000000000000000000000000000000';

function mockRepo(): IGenerationRunRepository {
  return {
    submitRun: vi.fn().mockResolvedValue({ runId: 'run-1' }),
    getRun: vi.fn(),
    streamRunEvents: vi.fn(),
    cancelRun: vi.fn().mockResolvedValue(undefined),
    retryRun: vi.fn().mockResolvedValue({ runId: 'run-retry' }),
    listRuns: vi.fn().mockResolvedValue([]),
    getArtifact: vi.fn(),
  };
}

describe('createGenerationClient', () => {
  it('startTopicContent builds theory snapshot and submits with default idempotency key', async () => {
    const local = mockRepo();
    const durable = mockRepo();
    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: local,
      durableRepo: durable,
    });

    const theoryParams = {
      ...ENVELOPE,
      subjectId: 'sub-1',
      topicId: 'topic-1',
      topicTitle: 'Vectors',
      learningObjective: 'Add vectors geometrically.',
    };

    await client.startTopicContent({ stage: 'theory', snapshotParams: theoryParams });

    expect(local.submitRun).toHaveBeenCalledTimes(1);
    expect(durable.submitRun).not.toHaveBeenCalled();

    const [runInputUntyped, idempotencyKey] = vi.mocked(local.submitRun).mock.calls[0]!;
    expect(runInputUntyped.pipelineKind).toBe('topic-content');
    const runInput = runInputUntyped as Extract<
      RunInput,
      { pipelineKind: 'topic-content' }
    >;
    expect(runInput.subjectId).toBe('sub-1');
    expect(runInput.topicId).toBe('topic-1');
    expect(runInput.snapshot).toMatchObject({
      pipeline_kind: 'topic-theory',
      subject_id: 'sub-1',
      topic_id: 'topic-1',
    });

    const expectedHash = await inputHash(runInput.snapshot);
    expect(idempotencyKey).toBe(`tc:sub-1:topic-1:theory:${expectedHash}`);
  });

  it('startTopicContent forwards explicit idempotencyKey unchanged', async () => {
    const local = mockRepo();
    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: local,
      durableRepo: mockRepo(),
    });

    await client.startTopicContent(
      {
        stage: 'study-cards',
        snapshotParams: {
          ...ENVELOPE,
          subjectId: 'sub-1',
          topicId: 'topic-1',
          theoryExcerpt: 'excerpt',
          syllabusQuestions: ['q'],
          targetDifficulty: 2,
          groundingSourceCount: 1,
          hasAuthoritativePrimarySource: false,
        },
      },
      { idempotencyKey: 'retry:orig:1' },
    );

    const [, key] = vi.mocked(local.submitRun).mock.calls[0]!;
    expect(key).toBe('retry:orig:1');
  });

  it('startTopicExpansion uses te: idempotency prefix and durable repo when flag on', async () => {
    const local = mockRepo();
    const durable = mockRepo();
    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: true },
      localRepo: local,
      durableRepo: durable,
    });

    await client.startTopicExpansion({
      ...ENVELOPE,
      subjectId: 'sub-1',
      topicId: 'topic-1',
      nextLevel: 2,
      difficulty: 1,
      theoryExcerpt: 't',
      syllabusQuestions: ['q'],
      existingCardIds: [],
      existingConceptStems: [],
      groundingSourceCount: 0,
    });

    expect(durable.submitRun).toHaveBeenCalledTimes(1);
    expect(local.submitRun).not.toHaveBeenCalled();
    const [runInputUntyped, idempotencyKey] = vi.mocked(durable.submitRun).mock.calls[0]!;
    expect(runInputUntyped.pipelineKind).toBe('topic-expansion');
    const runInput = runInputUntyped as Extract<
      RunInput,
      { pipelineKind: 'topic-expansion' }
    >;
    expect(runInput.nextLevel).toBe(2);
    const expectedHash = await inputHash(runInput.snapshot);
    expect(idempotencyKey).toBe(`te:sub-1:topic-1:2:${expectedHash}`);
  });

  it('startSubjectGraph topics stage uses sg: idempotency prefix', async () => {
    const local = mockRepo();
    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: local,
      durableRepo: mockRepo(),
    });

    await client.startSubjectGraph({
      stage: 'topics',
      snapshotParams: {
        ...ENVELOPE,
        subjectId: 'sub-1',
        checklist: { topic_name: 'Algebra' },
        strategyBrief: {
          total_tiers: 3,
          topics_per_tier: 5,
          audience_brief: 'undergrad',
          domain_brief: 'STEM',
          focus_constraints: 'proofs',
        },
      },
    });

    const [runInputUntyped, idempotencyKey] = vi.mocked(local.submitRun).mock.calls[0]!;
    expect(runInputUntyped.pipelineKind).toBe('subject-graph');
    const runInput = runInputUntyped as Extract<
      RunInput,
      { pipelineKind: 'subject-graph' }
    >;
    expect(runInput.stage).toBe('topics');
    const expectedHash = await inputHash(runInput.snapshot);
    expect(idempotencyKey).toBe(`sg:sub-1:topics:${expectedHash}`);
  });

  it('startCrystalTrial uses ct: idempotency prefix', async () => {
    const local = mockRepo();
    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: local,
      durableRepo: mockRepo(),
    });

    await client.startCrystalTrial({
      ...ENVELOPE,
      subjectId: 'sub-1',
      topicId: 'topic-1',
      currentLevel: 0,
      targetLevel: 1,
      cardPoolHash: VALID_CONTENT_HASH,
      questionCount: 5,
    });

    const [runInputUntyped, idempotencyKey] = vi.mocked(local.submitRun).mock.calls[0]!;
    expect(runInputUntyped.pipelineKind).toBe('crystal-trial');
    const runInput = runInputUntyped as Extract<
      RunInput,
      { pipelineKind: 'crystal-trial' }
    >;
    expect(runInput.currentLevel).toBe(0);
    const expectedHash = await inputHash(runInput.snapshot);
    expect(idempotencyKey).toBe(`ct:sub-1:topic-1:0:${expectedHash}`);
  });

  it('cancel and retry delegate to the selected repository', async () => {
    const local = mockRepo();
    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: local,
      durableRepo: mockRepo(),
    });

    await client.cancel('run-a', 'user');
    expect(local.cancelRun).toHaveBeenCalledWith('run-a', 'user');

    await client.retry('run-b', { stage: 'theory', jobId: 'j1' });
    expect(local.retryRun).toHaveBeenCalledWith('run-b', {
      stage: 'theory',
      jobId: 'j1',
    });
  });

  it('observe delegates streamRunEvents', async () => {
    const local = mockRepo();
    async function* gen(): AsyncGenerator<RunEvent> {
      yield {
        type: 'run.queued',
        runId: 'r',
        seq: 1,
        ts: '1970-01-01T00:00:00.000Z',
      };
    }
    vi.mocked(local.streamRunEvents).mockReturnValue(gen());

    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: local,
      durableRepo: mockRepo(),
    });

    const iter = client.observe('run-x', 3);
    for await (const e of iter) {
      expect(e.type).toBe('run.queued');
    }
    expect(local.streamRunEvents).toHaveBeenCalledWith('run-x', 3);
  });

  it('listActive and listRecent delegate listRuns', async () => {
    const local = mockRepo();
    const rows: RunSnapshot[] = [
      {
        runId: 'a',
        deviceId: 'd',
        kind: 'crystal-trial',
        status: 'applied-local',
        inputHash: 'inp_x',
        createdAt: 1,
        snapshotJson: {} as RunSnapshot['snapshotJson'],
        jobs: [],
      },
    ];
    vi.mocked(local.listRuns).mockResolvedValue(rows);

    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: local,
      durableRepo: mockRepo(),
    });

    await expect(client.listActive()).resolves.toEqual(rows);
    expect(local.listRuns).toHaveBeenCalledWith({ status: 'active' });

    await client.listRecent(15);
    expect(local.listRuns).toHaveBeenCalledWith({ status: 'recent', limit: 15 });
  });

  it('submitRun forwards to repo with default idempotency key when omitted', async () => {
    const local = mockRepo();
    const client = createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: local,
      durableRepo: mockRepo(),
    });

    const snapshot = {
      snapshot_version: 1,
      pipeline_kind: 'topic-theory',
      schema_version: 1,
      prompt_template_version: 'v1',
      model_id: 'm',
      captured_at: '2026-05-04T00:00:00.000Z',
      subject_id: 'sub-1',
      topic_id: 'topic-1',
      topic_title: 'T',
      learning_objective: 'L',
    } as TopicTheoryRunInputSnapshot;

    const runInput: Extract<RunInput, { pipelineKind: 'topic-content' }> = {
      pipelineKind: 'topic-content' as const,
      subjectId: 'sub-1',
      topicId: 'topic-1',
      snapshot,
      topicContentLegacyOptions: {
        enableReasoning: false,
        forceRegenerate: false,
        legacyStage: 'full' as const,
      },
    };

    await client.submitRun(runInput);

    expect(local.submitRun).toHaveBeenCalledTimes(1);
    const [, key] = vi.mocked(local.submitRun).mock.calls[0]!;
    expect(key).toMatch(/^tc:sub-1:topic-1:full:/);
  });
});

describe('registerGenerationClient / getGenerationClient', () => {
  it('returns the registered client', async () => {
    vi.resetModules();
    const mod = await import('./generationClient');
    const client = mod.createGenerationClient({
      deviceId: 'dev-1',
      now: () => 0,
      flags: { durableRuns: false },
      localRepo: mockRepo(),
      durableRepo: mockRepo(),
    });
    mod.registerGenerationClient(client);
    expect(mod.getGenerationClient()).toBe(client);
  });

  it('throw when nothing registered', async () => {
    vi.resetModules();
    const mod = await import('./generationClient');
    expect(() => mod.getGenerationClient()).toThrow(/registerGenerationClient/);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 PR-2E: Durable-repo retry tests covering { stage } + { jobId }
// ---------------------------------------------------------------------------

describe('retryRun with { stage } + { jobId } per pipeline kind', () => {
  const PIPELINE_RETRY_CASES = [
    {
      kind: 'crystal-trial' as const,
      stageOpts: [{ stage: 'generate' }, { stage: 'validate' }],
      jobIdOpts: [{ jobId: 'job-ct-1' }, { jobId: 'job-ct-2' }],
      combinedOpts: [{ stage: 'generate', jobId: 'job-ct-3' }],
    },
    {
      kind: 'topic-content' as const,
      stageOpts: [
        { stage: 'theory' },
        { stage: 'study-cards' },
        { stage: 'mini-games' },
      ],
      jobIdOpts: [{ jobId: 'job-tc-1' }, { jobId: 'job-tc-2' }],
      combinedOpts: [
        { stage: 'theory', jobId: 'job-tc-3' },
        { stage: 'mini-games', jobId: 'job-tc-4' },
      ],
    },
    {
      kind: 'topic-expansion' as const,
      stageOpts: [{ stage: 'expansion-cards' }],
      jobIdOpts: [{ jobId: 'job-te-1' }],
      combinedOpts: [{ stage: 'expansion-cards', jobId: 'job-te-2' }],
    },
    {
      kind: 'subject-graph' as const,
      stageOpts: [{ stage: 'topics' }, { stage: 'edges' }],
      jobIdOpts: [{ jobId: 'job-sg-1' }, { jobId: 'job-sg-2' }],
      combinedOpts: [
        { stage: 'topics', jobId: 'job-sg-3' },
        { stage: 'edges', jobId: 'job-sg-4' },
      ],
    },
  ];

  for (const { kind, stageOpts, jobIdOpts, combinedOpts } of PIPELINE_RETRY_CASES) {
    describe(`${kind} retries`, () => {
      it('forwards simple retry (no opts) to repo', async () => {
        const local = mockRepo();
        const client = createGenerationClient({
          deviceId: 'dev-1',
          now: () => 0,
          flags: { durableRuns: false },
          localRepo: local,
          durableRepo: mockRepo(),
        });

        await client.retry('run-1');
        expect(local.retryRun).toHaveBeenCalledWith('run-1', undefined);
      });

      for (const opts of stageOpts) {
        it(`forwards retry with stage=${opts.stage} to repo`, async () => {
          const local = mockRepo();
          const client = createGenerationClient({
            deviceId: 'dev-1',
            now: () => 0,
            flags: { durableRuns: false },
            localRepo: local,
            durableRepo: mockRepo(),
          });

          await client.retry('run-stage', opts);
          expect(local.retryRun).toHaveBeenCalledWith('run-stage', opts);
        });
      }

      for (const opts of jobIdOpts) {
        it(`forwards retry with jobId=${opts.jobId} to repo`, async () => {
          const local = mockRepo();
          const client = createGenerationClient({
            deviceId: 'dev-1',
            now: () => 0,
            flags: { durableRuns: false },
            localRepo: local,
            durableRepo: mockRepo(),
          });

          await client.retry('run-job', opts);
          expect(local.retryRun).toHaveBeenCalledWith('run-job', opts);
        });
      }

      for (const opts of combinedOpts) {
        it(`forwards retry with stage=${opts.stage} + jobId=${opts.jobId} to repo`, async () => {
          const local = mockRepo();
          const client = createGenerationClient({
            deviceId: 'dev-1',
            now: () => 0,
            flags: { durableRuns: false },
            localRepo: local,
            durableRepo: mockRepo(),
          });

          await client.retry('run-combined', opts);
          expect(local.retryRun).toHaveBeenCalledWith('run-combined', opts);
        });
      }
    });
  }
});
