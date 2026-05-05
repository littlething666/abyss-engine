import type { RunEvent, RunInputSnapshot } from '@/features/generationContracts';
import {
  buildCrystalTrialSnapshot,
  buildSubjectGraphEdgesSnapshot,
  buildSubjectGraphTopicsSnapshot,
  buildTopicExpansionSnapshot,
  buildTopicMiniGameCardsSnapshot,
  buildTopicStudyCardsSnapshot,
  buildTopicTheorySnapshot,
  inputHash,
  type BuildCrystalTrialSnapshotParams,
  type BuildSubjectGraphEdgesSnapshotParams,
  type BuildSubjectGraphTopicsSnapshotParams,
  type BuildTopicExpansionSnapshotParams,
  type BuildTopicMiniGameCardsSnapshotParams,
  type BuildTopicStudyCardsSnapshotParams,
  type BuildTopicTheorySnapshotParams,
} from '@/features/generationContracts';
import type {
  CancelReason,
  IGenerationRunRepository,
  RunInput,
  RunSnapshot,
  TopicContentRunInputSnapshot,
} from '@/types/repository';

/** Stage segment for topic-content idempotency keys and snapshot routing. */
export type TopicContentStageTag = 'theory' | 'study-cards' | 'mini-games' | 'full';

/**
 * Resolved inputs for a topic-content run. Each variant maps to one snapshot
 * builder; callers assemble domain fields (titles, excerpts, model ids) before
 * invoking `startTopicContent`.
 */
export type TopicContentStartInput =
  | { stage: 'theory'; snapshotParams: BuildTopicTheorySnapshotParams }
  | { stage: 'study-cards'; snapshotParams: BuildTopicStudyCardsSnapshotParams }
  | { stage: 'mini-games'; snapshotParams: BuildTopicMiniGameCardsSnapshotParams };

export type SubjectGraphStartInput =
  | { stage: 'topics'; snapshotParams: BuildSubjectGraphTopicsSnapshotParams }
  | { stage: 'edges'; snapshotParams: BuildSubjectGraphEdgesSnapshotParams };

/** Same fields as the snapshot builder; `nextLevel` is narrowed to crystal tiers. */
export type TopicExpansionStartInput = Omit<
  BuildTopicExpansionSnapshotParams,
  'nextLevel'
> & {
  nextLevel: 1 | 2 | 3;
};

export type CrystalTrialStartInput = BuildCrystalTrialSnapshotParams;

export interface GenerationClientFlags {
  durableRuns: boolean;
}

export interface CreateGenerationClientDeps {
  /** Reserved for durable HTTP wiring (Phase 0.5 step 7); repository adapters already scope runs. */
  deviceId: string;
  /** Reserved for clock-skew / testing at the composition root. */
  now: () => number;
  flags: GenerationClientFlags;
  localRepo: IGenerationRunRepository;
  durableRepo: IGenerationRunRepository;
}

export interface GenerationClient {
  startTopicContent(
    input: TopicContentStartInput,
    opts?: { idempotencyKey?: string },
  ): Promise<{ runId: string }>;
  startTopicExpansion(
    input: TopicExpansionStartInput,
    opts?: { idempotencyKey?: string },
  ): Promise<{ runId: string }>;
  startSubjectGraph(
    input: SubjectGraphStartInput,
    opts?: { idempotencyKey?: string },
  ): Promise<{ runId: string }>;
  startCrystalTrial(
    input: CrystalTrialStartInput,
    opts?: { idempotencyKey?: string },
  ): Promise<{ runId: string }>;
  /**
   * Low-level submit when a `RunInput` is already assembled (legacy bridge,
   * composition roots, retries). Computes the default Idempotency-Key from
   * `input.snapshot` when `opts.idempotencyKey` is omitted.
   */
  submitRun(input: RunInput, opts?: { idempotencyKey?: string }): Promise<{ runId: string }>;
  cancel(runId: string, reason: CancelReason): Promise<void>;
  retry(
    runId: string,
    opts?: { stage?: string; jobId?: string },
  ): Promise<{ runId: string }>;
  observe(runId: string, lastSeq?: number): AsyncIterable<RunEvent>;
  listActive(): Promise<RunSnapshot[]>;
  listRecent(limit: number): Promise<RunSnapshot[]>;
}

let registeredClient: GenerationClient | null = null;

export function registerGenerationClient(client: GenerationClient): void {
  registeredClient = client;
}

export function getGenerationClient(): GenerationClient {
  if (!registeredClient) {
    throw new Error(
      'getGenerationClient: no client registered; call registerGenerationClient() during app bootstrap',
    );
  }
  return registeredClient;
}

function pickRepo(deps: CreateGenerationClientDeps): IGenerationRunRepository {
  return deps.flags.durableRuns ? deps.durableRepo : deps.localRepo;
}

function topicContentSnapshot(input: TopicContentStartInput): TopicContentRunInputSnapshot {
  if (input.stage === 'theory') {
    return buildTopicTheorySnapshot(input.snapshotParams);
  }
  if (input.stage === 'study-cards') {
    return buildTopicStudyCardsSnapshot(input.snapshotParams);
  }
  return buildTopicMiniGameCardsSnapshot(input.snapshotParams);
}

function defaultTopicContentIdempotencyKey(
  subjectId: string,
  topicId: string,
  stageTag: TopicContentStageTag,
  snapshot: TopicContentRunInputSnapshot,
): Promise<string> {
  return inputHash(snapshot).then(
    (h) => `tc:${subjectId}:${topicId}:${stageTag}:${h}`,
  );
}

function defaultTopicExpansionIdempotencyKey(
  subjectId: string,
  topicId: string,
  nextLevel: number,
  snapshot: Awaited<ReturnType<typeof buildTopicExpansionSnapshot>>,
): Promise<string> {
  return inputHash(snapshot).then(
    (h) => `te:${subjectId}:${topicId}:${nextLevel}:${h}`,
  );
}

function defaultSubjectGraphIdempotencyKey(
  subjectId: string,
  stage: 'topics' | 'edges',
  snapshot: RunInputSnapshot,
): Promise<string> {
  return inputHash(snapshot).then((h) => `sg:${subjectId}:${stage}:${h}`);
}

function defaultCrystalTrialIdempotencyKey(
  subjectId: string,
  topicId: string,
  currentLevel: number,
  snapshot: Awaited<ReturnType<typeof buildCrystalTrialSnapshot>>,
): Promise<string> {
  return inputHash(snapshot).then(
    (h) => `ct:${subjectId}:${topicId}:${currentLevel}:${h}`,
  );
}

function topicContentIdempotencySegment(
  input: Extract<RunInput, { pipelineKind: 'topic-content' }>,
): TopicContentStageTag {
  const ls = input.topicContentLegacyOptions?.legacyStage;
  if (ls === 'full') return 'full';
  if (ls === 'theory') return 'theory';
  if (ls === 'study-cards') return 'study-cards';
  if (ls === 'mini-games') return 'mini-games';
  const snap = input.snapshot;
  if (snap.pipeline_kind === 'topic-theory') return 'theory';
  if (snap.pipeline_kind === 'topic-study-cards') return 'study-cards';
  return 'mini-games';
}

async function defaultIdempotencyKeyForRunInput(input: RunInput): Promise<string> {
  switch (input.pipelineKind) {
    case 'topic-content': {
      const h = await inputHash(input.snapshot);
      const seg = topicContentIdempotencySegment(input);
      return `tc:${input.subjectId}:${input.topicId}:${seg}:${h}`;
    }
    case 'topic-expansion':
      return defaultTopicExpansionIdempotencyKey(
        input.subjectId,
        input.topicId,
        input.nextLevel,
        input.snapshot,
      );
    case 'subject-graph':
      return defaultSubjectGraphIdempotencyKey(input.subjectId, input.stage, input.snapshot);
    case 'crystal-trial':
      return defaultCrystalTrialIdempotencyKey(
        input.subjectId,
        input.topicId,
        input.currentLevel,
        input.snapshot,
      );
  }
}

export function createGenerationClient(deps: CreateGenerationClientDeps): GenerationClient {
  const repo = (): IGenerationRunRepository => pickRepo(deps);

  return {
    async startTopicContent(input, opts) {
      const snapshot = topicContentSnapshot(input);
      const { subjectId, topicId } = input.snapshotParams;
      const idempotencyKey =
        opts?.idempotencyKey ??
        (await defaultTopicContentIdempotencyKey(
          subjectId,
          topicId,
          input.stage,
          snapshot,
        ));
      const runInput: RunInput = {
        pipelineKind: 'topic-content',
        snapshot,
        subjectId,
        topicId,
      };
      return repo().submitRun(runInput, idempotencyKey);
    },

    async startTopicExpansion(input, opts) {
      const snapshot = buildTopicExpansionSnapshot(input);
      const idempotencyKey =
        opts?.idempotencyKey ??
        (await defaultTopicExpansionIdempotencyKey(
          input.subjectId,
          input.topicId,
          input.nextLevel,
          snapshot,
        ));
      const runInput: RunInput = {
        pipelineKind: 'topic-expansion',
        snapshot,
        subjectId: input.subjectId,
        topicId: input.topicId,
        nextLevel: input.nextLevel,
      };
      return repo().submitRun(runInput, idempotencyKey);
    },

    async startSubjectGraph(input, opts) {
      const snapshot =
        input.stage === 'topics'
          ? buildSubjectGraphTopicsSnapshot(input.snapshotParams)
          : buildSubjectGraphEdgesSnapshot(input.snapshotParams);
      const subjectId = input.snapshotParams.subjectId;
      const idempotencyKey =
        opts?.idempotencyKey ??
        (await defaultSubjectGraphIdempotencyKey(subjectId, input.stage, snapshot));
      const runInput: RunInput = {
        pipelineKind: 'subject-graph',
        snapshot,
        subjectId,
        stage: input.stage,
      };
      return repo().submitRun(runInput, idempotencyKey);
    },

    async startCrystalTrial(input, opts) {
      const snapshot = buildCrystalTrialSnapshot(input);
      const idempotencyKey =
        opts?.idempotencyKey ??
        (await defaultCrystalTrialIdempotencyKey(
          input.subjectId,
          input.topicId,
          input.currentLevel,
          snapshot,
        ));
      const runInput: RunInput = {
        pipelineKind: 'crystal-trial',
        snapshot,
        subjectId: input.subjectId,
        topicId: input.topicId,
        currentLevel: input.currentLevel,
      };
      return repo().submitRun(runInput, idempotencyKey);
    },

    async submitRun(input, opts) {
      const idempotencyKey =
        opts?.idempotencyKey ?? (await defaultIdempotencyKeyForRunInput(input));
      return repo().submitRun(input, idempotencyKey);
    },

    cancel(runId, reason) {
      return repo().cancelRun(runId, reason);
    },

    retry(runId, opts) {
      return repo().retryRun(runId, opts);
    },

    observe(runId, lastSeq) {
      return repo().streamRunEvents(runId, lastSeq);
    },

    listActive() {
      return repo().listRuns({ status: 'active' });
    },

    listRecent(limit) {
      return repo().listRuns({ status: 'recent', limit });
    },
  };
}
