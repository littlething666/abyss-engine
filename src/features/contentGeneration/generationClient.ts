import type { ArtifactEnvelope, RunEvent } from '@/features/generationContracts';
import type {
  CancelReason,
  GenerationRunIntent,
  IGenerationRunRepository,
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

export interface CreateGenerationClientDeps {
  /** Reserved for durable HTTP wiring; repository adapters already scope runs. */
  deviceId: string;
  /** Reserved for clock-skew / testing at the composition root. */
  now: () => number;
  repo: IGenerationRunRepository;
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

function assertSupportedSubmitInput(input: SubmitGenerationRunInput): void {
  if (!isLegacyRunInput(input)) return;

  // Temporary compatibility for durable rehydration/local-runner deletion sequencing:
  // legacy RunInput can still reach low-level submit until PR 7 removes the type.
  if (!input.pipelineKind) {
    throw new Error('GenerationClient received an invalid legacy RunInput without pipelineKind');
  }
}

function defaultIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.randomUUID) {
    throw new Error('GenerationClient requires crypto.randomUUID() to create intent idempotency keys');
  }
  return `run:${cryptoApi.randomUUID()}`;
}

export function createGenerationClient(deps: CreateGenerationClientDeps): GenerationClient {
  const repo = (): IGenerationRunRepository => deps.repo;

  async function submitIntent(input: GenerationRunIntent, opts?: { idempotencyKey?: string }): Promise<{ runId: string }> {
    return repo().submitRun(input, opts?.idempotencyKey ?? defaultIdempotencyKey());
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
      assertSupportedSubmitInput(input);
      return repo().submitRun(input, opts?.idempotencyKey ?? defaultIdempotencyKey());
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
