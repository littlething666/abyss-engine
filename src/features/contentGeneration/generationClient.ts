import type { ArtifactEnvelope, RunEvent } from '@/features/generationContracts';
import type {
  CancelReason,
  GenerationRunIntent,
  IGenerationRunRepository,
  PipelineKind,
  RunInput,
  RunListQuery,
  RunSnapshot,
  SubmitGenerationRunInput,
} from '@/types/repository';

export type TopicContentStartInput = Extract<GenerationRunIntent, { kind: 'topic-content' }>;
export type TopicContentStageTag = TopicContentStartInput['stage'];
export type SubjectGraphStartInput = Extract<GenerationRunIntent, { kind: 'subject-graph' }>;
export type TopicExpansionStartInput = Extract<GenerationRunIntent, { kind: 'topic-expansion' }>;
export type CrystalTrialStartInput = Extract<GenerationRunIntent, { kind: 'crystal-trial' }>;

export interface GenerationClientFlags {
  durableRuns: boolean;
}

export interface CreateGenerationClientDeps {
  /** Reserved for durable HTTP wiring; repository adapters already scope runs. */
  deviceId: string;
  /** Reserved for clock-skew / testing at the composition root. */
  now: () => number;
  flags: GenerationClientFlags;
  /** Transitional routing seam removed once durable-only wiring lands. */
  durableKinds?: Set<PipelineKind>;
  localRepo: IGenerationRunRepository;
  durableRepo: IGenerationRunRepository;
}

export interface GenerationClient {
  startTopicContent(input: TopicContentStartInput, opts?: { idempotencyKey?: string }): Promise<{ runId: string }>;
  startTopicExpansion(input: TopicExpansionStartInput, opts?: { idempotencyKey?: string }): Promise<{ runId: string }>;
  startSubjectGraph(input: SubjectGraphStartInput, opts?: { idempotencyKey?: string }): Promise<{ runId: string }>;
  startCrystalTrial(input: CrystalTrialStartInput, opts?: { idempotencyKey?: string }): Promise<{ runId: string }>;
  /**
   * Low-level submit. New frontend runtime callers must pass compact intents;
   * legacy RunInput is accepted only until local-runner callers are deleted.
   */
  submitRun(input: SubmitGenerationRunInput, opts?: { idempotencyKey?: string }): Promise<{ runId: string }>;
  cancel(runId: string, reason: CancelReason): Promise<void>;
  retry(runId: string, opts?: { stage?: string; jobId?: string }): Promise<{ runId: string }>;
  observe(runId: string, lastSeq?: number): AsyncIterable<RunEvent>;
  listActive(): Promise<RunSnapshot[]>;
  listRecent(limit: number): Promise<RunSnapshot[]>;
  listRuns(query: RunListQuery): Promise<RunSnapshot[]>;
  getArtifact(artifactId: string): Promise<ArtifactEnvelope>;
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

function isLegacyRunInput(input: SubmitGenerationRunInput): input is RunInput {
  return 'pipelineKind' in input;
}

function kindOf(input: SubmitGenerationRunInput): PipelineKind {
  return isLegacyRunInput(input) ? input.pipelineKind : input.kind;
}

function selectRepoFor(kind: PipelineKind, deps: CreateGenerationClientDeps): IGenerationRunRepository {
  const kinds = deps.durableKinds ?? new Set<PipelineKind>([
    'crystal-trial',
    'topic-content',
    'topic-expansion',
    'subject-graph',
  ]);
  return deps.flags.durableRuns && kinds.has(kind) ? deps.durableRepo : deps.localRepo;
}

function pickRepo(deps: CreateGenerationClientDeps): IGenerationRunRepository {
  return deps.flags.durableRuns ? deps.durableRepo : deps.localRepo;
}

function defaultIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.randomUUID) {
    throw new Error('GenerationClient requires crypto.randomUUID() to create intent idempotency keys');
  }
  return `run:${cryptoApi.randomUUID()}`;
}

export function createGenerationClient(deps: CreateGenerationClientDeps): GenerationClient {
  const repo = (): IGenerationRunRepository => pickRepo(deps);

  async function submitIntent(input: GenerationRunIntent, opts?: { idempotencyKey?: string }): Promise<{ runId: string }> {
    return selectRepoFor(input.kind, deps).submitRun(input, opts?.idempotencyKey ?? defaultIdempotencyKey());
  }

  return {
    startTopicContent(input, opts) {
      return submitIntent(input, opts);
    },

    startTopicExpansion(input, opts) {
      return submitIntent(input, opts);
    },

    startSubjectGraph(input, opts) {
      return submitIntent(input, opts);
    },

    startCrystalTrial(input, opts) {
      return submitIntent(input, opts);
    },

    async submitRun(input, opts) {
      return selectRepoFor(kindOf(input), deps).submitRun(input, opts?.idempotencyKey ?? defaultIdempotencyKey());
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

    listRuns(query) {
      return repo().listRuns(query);
    },

    getArtifact(artifactId) {
      return repo().getArtifact(artifactId);
    },
  };
}
