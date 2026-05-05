import {
  inputHash,
  type ArtifactEnvelope,
  type ArtifactKind,
  type GenerationFailureCode,
  type RunEvent,
  type RunStatus,
  type StageProgressEventBody,
} from '@/features/generationContracts';
import type {
  CancelReason,
  IGenerationRunRepository,
  JobSnapshot,
  PipelineKind,
  RunInput,
  RunListQuery,
  RunSnapshot,
} from '@/types/repository';

// ---------------------------------------------------------------------------
// Durable Workflow Orchestration — Phase 0.5 step 2 (scaffold).
//
// `LocalGenerationRunRepository` is the in-tab adapter for
// `IGenerationRunRepository`. It synthesizes per-run monotonic `seq`-numbered
// `RunEvent`s, dedupes submissions on a 24h idempotency-key window,
// implements cooperative cancel (`run.cancel-acknowledged` ≠ terminal
// `run.cancelled` per Plan v3 Q16), and owns supersession bookkeeping for
// topic-expansion replacements.
//
// The four legacy runners are reached through an injectable
// `LocalRunnerDispatchers` seam so the adapter logic is fully testable
// without depending on runner internals. Wiring the four real runners
// (`runTopicGenerationPipeline`, `runExpansionJob`, the Subject Graph
// orchestrator, `generateTrialQuestions`) is step 2b on the same branch;
// after that wiring lands, this file becomes the only file allowed to
// import those entry points and the legacyRunnerBoundary.test.ts scope
// widens to enforce that.
// ---------------------------------------------------------------------------

/** Outcome a dispatcher hands back; the adapter synthesizes the terminal event. */
export type LocalRunnerOutcome =
  | {
      status: 'success';
      artifacts: ReadonlyArray<{
        kind: ArtifactKind;
        contentHash: string;
        schemaVersion: number;
        payload: unknown;
      }>;
    }
  | {
      status: 'failure';
      code: GenerationFailureCode;
      message: string;
    }
  | { status: 'cancelled' };

export interface LocalRunnerInvocation {
  runId: string;
  input: RunInput;
  /** Dispatcher calls this to surface stage.progress events to the adapter. */
  emitProgress: (body: StageProgressEventBody) => void;
  /** Forwarded to the legacy runner so a `cancelRun(...)` aborts in-flight work. */
  signal: AbortSignal;
}

export type LocalRunnerDispatch = (
  invocation: LocalRunnerInvocation,
) => Promise<LocalRunnerOutcome>;

export interface LocalRunnerDispatchers {
  topicContent: LocalRunnerDispatch;
  topicExpansion: LocalRunnerDispatch;
  subjectGraph: LocalRunnerDispatch;
  crystalTrial: LocalRunnerDispatch;
}

export interface LocalGenerationRunRepositoryDeps {
  deviceId: string;
  /** Injectable clock for deterministic tests. */
  now: () => number;
  dispatchers: LocalRunnerDispatchers;
  /** Opt-in supersession key. Default key matches Plan v3 topic-expansion semantics. */
  supersessionKey?: (input: RunInput) => string | undefined;
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const EVENT_BUFFER_CAP = 200;

const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  'applied-local',
  'failed-final',
  'cancelled',
]);

const TERMINAL_EVENT_TYPES: ReadonlySet<RunEvent['type']> = new Set([
  'run.completed',
  'run.failed',
  'run.cancelled',
]);

interface IdempotencyEntry {
  runId: string;
  expiresAt: number;
}

interface LocalRunRecord {
  runId: string;
  deviceId: string;
  kind: PipelineKind;
  status: RunStatus;
  inputHash: string;
  parentRunId?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  errorCode?: string;
  errorMessage?: string;
  input: RunInput;
  jobs: JobSnapshot[];
  events: RunEvent[];
  nextSeq: number;
  abortController: AbortController;
  cancelReason?: CancelReason;
  subscribers: Set<(event: RunEvent) => void>;
  terminal: Promise<void>;
  resolveTerminal: () => void;
}

/** `Omit` distributed across each member of the `RunEvent` union. */
type RunEventBody<T extends RunEvent = RunEvent> = T extends T
  ? Omit<T, 'runId' | 'seq' | 'ts'>
  : never;

function defaultSupersessionKey(input: RunInput): string | undefined {
  if (input.pipelineKind === 'topic-expansion') {
    return `te:${input.subjectId}:${input.topicId}`;
  }
  return undefined;
}

function routingContextOf(input: RunInput): { subjectId: string; topicId?: string } {
  switch (input.pipelineKind) {
    case 'topic-content':
    case 'topic-expansion':
    case 'crystal-trial':
      return { subjectId: input.subjectId, topicId: input.topicId };
    case 'subject-graph':
      return { subjectId: input.subjectId };
  }
}

function pickDispatch(
  dispatchers: LocalRunnerDispatchers,
  kind: PipelineKind,
): LocalRunnerDispatch {
  switch (kind) {
    case 'topic-content':
      return dispatchers.topicContent;
    case 'topic-expansion':
      return dispatchers.topicExpansion;
    case 'subject-graph':
      return dispatchers.subjectGraph;
    case 'crystal-trial':
      return dispatchers.crystalTrial;
  }
}

export class LocalGenerationRunRepository implements IGenerationRunRepository {
  private readonly deviceId: string;
  private readonly now: () => number;
  private readonly dispatchers: LocalRunnerDispatchers;
  private readonly supersessionKeyOf: (input: RunInput) => string | undefined;
  private readonly records = new Map<string, LocalRunRecord>();
  private readonly idempotency = new Map<string, IdempotencyEntry>();
  private readonly artifactsById = new Map<string, ArtifactEnvelope>();
  private readonly supersessionRunIds = new Map<string, string>();

  constructor(deps: LocalGenerationRunRepositoryDeps) {
    this.deviceId = deps.deviceId;
    this.now = deps.now;
    this.dispatchers = deps.dispatchers;
    this.supersessionKeyOf = deps.supersessionKey ?? defaultSupersessionKey;
  }

  async submitRun(
    input: RunInput,
    idempotencyKey: string,
  ): Promise<{ runId: string }> {
    this.sweepIdempotency();

    const existing = this.idempotency.get(idempotencyKey);
    if (existing !== undefined && this.records.has(existing.runId)) {
      return { runId: existing.runId };
    }

    const hash = inputHash(input.snapshot);
    const runId = crypto.randomUUID();
    const record = this.createRecord(runId, input, hash);
    this.records.set(runId, record);
    this.idempotency.set(idempotencyKey, {
      runId,
      expiresAt: this.now() + IDEMPOTENCY_TTL_MS,
    });

    await this.applySupersession(record);

    this.emit(record, { type: 'run.queued' });
    record.status = 'planning';
    this.emit(record, { type: 'run.status', status: 'planning' });

    void this.dispatch(record);
    return { runId };
  }

  async getRun(runId: string): Promise<RunSnapshot> {
    return this.toSnapshot(this.requireRecord(runId));
  }

  async *streamRunEvents(
    runId: string,
    lastSeq?: number,
  ): AsyncIterableIterator<RunEvent> {
    const record = this.requireRecord(runId);
    const startSeq = lastSeq ?? 0;
    const replayed = new Set<number>();

    for (const event of record.events) {
      if (event.seq > startSeq) {
        replayed.add(event.seq);
        yield event;
        if (TERMINAL_EVENT_TYPES.has(event.type)) return;
      }
    }

    if (TERMINAL_RUN_STATUSES.has(record.status)) return;

    const queue: RunEvent[] = [];
    let resolveNext: (() => void) | null = null;
    const subscriber = (event: RunEvent): void => {
      if (replayed.has(event.seq)) return;
      queue.push(event);
      const r = resolveNext;
      resolveNext = null;
      r?.();
    };
    record.subscribers.add(subscriber);

    try {
      while (true) {
        while (queue.length > 0) {
          const event = queue.shift() as RunEvent;
          yield event;
          if (TERMINAL_EVENT_TYPES.has(event.type)) return;
        }
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    } finally {
      record.subscribers.delete(subscriber);
    }
  }

  async cancelRun(runId: string, reason: CancelReason): Promise<void> {
    const record = this.requireRecord(runId);
    await this.cancelInternal(record, reason);
  }

  async retryRun(
    runId: string,
    opts?: { stage?: string; jobId?: string },
  ): Promise<{ runId: string }> {
    void opts; // Stage-/job-scoped slicing is wired alongside real runners (step 2b).
    const original = this.requireRecord(runId);
    const newRunId = crypto.randomUUID();
    const record = this.createRecord(newRunId, original.input, original.inputHash);
    record.parentRunId = runId;
    this.records.set(newRunId, record);

    this.emit(record, { type: 'run.queued' });
    record.status = 'planning';
    this.emit(record, { type: 'run.status', status: 'planning' });

    void this.dispatch(record);
    return { runId: newRunId };
  }

  async listRuns(query: RunListQuery): Promise<RunSnapshot[]> {
    const { status, kind, subjectId, topicId, limit } = query;
    let records = Array.from(this.records.values());
    if (kind !== undefined) records = records.filter((r) => r.kind === kind);
    if (status === 'active') {
      records = records.filter((r) => !TERMINAL_RUN_STATUSES.has(r.status));
    } else if (status === 'recent') {
      records = records.filter((r) => TERMINAL_RUN_STATUSES.has(r.status));
    }
    if (subjectId !== undefined) {
      records = records.filter((r) => routingContextOf(r.input).subjectId === subjectId);
    }
    if (topicId !== undefined) {
      records = records.filter((r) => routingContextOf(r.input).topicId === topicId);
    }
    records.sort((a, b) => b.createdAt - a.createdAt);
    if (limit !== undefined) records = records.slice(0, limit);
    return records.map((r) => this.toSnapshot(r));
  }

  async getArtifact(artifactId: string): Promise<ArtifactEnvelope> {
    const envelope = this.artifactsById.get(artifactId);
    if (envelope === undefined) {
      throw new Error(`Unknown artifactId: ${artifactId}`);
    }
    return envelope;
  }

  // --- internals ---

  private requireRecord(runId: string): LocalRunRecord {
    const r = this.records.get(runId);
    if (r === undefined) throw new Error(`Unknown runId: ${runId}`);
    return r;
  }

  private sweepIdempotency(): void {
    const t = this.now();
    for (const [key, entry] of this.idempotency) {
      if (entry.expiresAt <= t) this.idempotency.delete(key);
    }
  }

  private createRecord(
    runId: string,
    input: RunInput,
    hash: string,
  ): LocalRunRecord {
    let resolveTerminal: () => void = () => undefined;
    const terminal = new Promise<void>((resolve) => {
      resolveTerminal = resolve;
    });
    return {
      runId,
      deviceId: this.deviceId,
      kind: input.pipelineKind,
      status: 'queued',
      inputHash: hash,
      createdAt: this.now(),
      input,
      jobs: [],
      events: [],
      nextSeq: 0,
      abortController: new AbortController(),
      subscribers: new Set(),
      terminal,
      resolveTerminal,
    };
  }

  private async applySupersession(record: LocalRunRecord): Promise<void> {
    const key = this.supersessionKeyOf(record.input);
    if (key === undefined) return;
    const priorRunId = this.supersessionRunIds.get(key);
    if (priorRunId !== undefined && priorRunId !== record.runId) {
      const prior = this.records.get(priorRunId);
      if (prior !== undefined && !TERMINAL_RUN_STATUSES.has(prior.status)) {
        await this.cancelInternal(prior, 'superseded');
      }
    }
    this.supersessionRunIds.set(key, record.runId);
  }

  private async dispatch(record: LocalRunRecord): Promise<void> {
    if (record.cancelReason !== undefined) {
      this.markCancelled(record);
      return;
    }
    record.startedAt = this.now();
    record.status = 'generating-stage';
    this.emit(record, { type: 'run.status', status: 'generating-stage' });

    const dispatch = pickDispatch(this.dispatchers, record.kind);
    let outcome: LocalRunnerOutcome;
    try {
      outcome = await dispatch({
        runId: record.runId,
        input: record.input,
        emitProgress: (body) => {
          if (TERMINAL_RUN_STATUSES.has(record.status)) return;
          this.emit(record, { type: 'stage.progress', body });
        },
        signal: record.abortController.signal,
      });
    } catch (err) {
      outcome = {
        status: 'failure',
        code: 'llm:upstream-5xx',
        message: err instanceof Error ? err.message : String(err),
      };
    }

    record.finishedAt = this.now();

    if (record.cancelReason !== undefined || outcome.status === 'cancelled') {
      this.markCancelled(record);
      return;
    }

    if (outcome.status === 'failure') {
      record.errorCode = outcome.code;
      record.errorMessage = outcome.message;
      record.status = 'failed-final';
      this.emit(record, {
        type: 'run.failed',
        code: outcome.code,
        message: outcome.message,
      });
      record.resolveTerminal();
      return;
    }

    const ctx = routingContextOf(record.input);
    for (const artifact of outcome.artifacts) {
      const artifactId = crypto.randomUUID();
      const createdAt = new Date(this.now()).toISOString();
      this.artifactsById.set(artifactId, {
        kind: 'inline',
        artifact: {
          id: artifactId,
          kind: artifact.kind,
          contentHash: artifact.contentHash,
          inputHash: record.inputHash,
          schemaVersion: artifact.schemaVersion,
          createdByRunId: record.runId,
          createdAt,
          payload: artifact.payload,
        },
      });
      this.emit(record, {
        type: 'artifact.ready',
        body: {
          artifactId,
          subjectId: ctx.subjectId,
          topicId: ctx.topicId,
          kind: artifact.kind,
          contentHash: artifact.contentHash,
          schemaVersion: artifact.schemaVersion,
          inputHash: record.inputHash,
        },
      });
    }

    record.status = 'ready';
    this.emit(record, { type: 'run.status', status: 'ready' });
    record.status = 'applied-local';
    this.emit(record, { type: 'run.completed' });
    record.resolveTerminal();
  }

  private async cancelInternal(
    record: LocalRunRecord,
    reason: CancelReason,
  ): Promise<void> {
    if (TERMINAL_RUN_STATUSES.has(record.status)) return;
    if (record.cancelReason !== undefined) {
      await record.terminal;
      return;
    }
    record.cancelReason = reason;
    this.emit(record, { type: 'run.cancel-acknowledged', reason });
    record.abortController.abort();
    if (record.startedAt === undefined) {
      // Cancel beat the dispatcher to the start of the run.
      this.markCancelled(record);
      return;
    }
    await record.terminal;
  }

  private markCancelled(record: LocalRunRecord): void {
    if (TERMINAL_RUN_STATUSES.has(record.status)) return;
    const reason = record.cancelReason ?? 'user';
    record.status = 'cancelled';
    record.finishedAt ??= this.now();
    this.emit(record, { type: 'run.cancelled', reason });
    record.resolveTerminal();
  }

  private emit(record: LocalRunRecord, body: RunEventBody): void {
    record.nextSeq += 1;
    const event = {
      ...body,
      runId: record.runId,
      seq: record.nextSeq,
      ts: new Date(this.now()).toISOString(),
    } as RunEvent;
    record.events.push(event);
    if (record.events.length > EVENT_BUFFER_CAP) record.events.shift();
    for (const subscriber of record.subscribers) {
      try {
        subscriber(event);
      } catch {
        // Swallow subscriber errors so one bad consumer can't break others.
      }
    }
  }

  private toSnapshot(record: LocalRunRecord): RunSnapshot {
    return {
      runId: record.runId,
      deviceId: record.deviceId,
      kind: record.kind,
      status: record.status,
      inputHash: record.inputHash,
      parentRunId: record.parentRunId,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      errorCode: record.errorCode,
      errorMessage: record.errorMessage,
      snapshotJson: record.input.snapshot,
      jobs: record.jobs.slice(),
    };
  }
}
