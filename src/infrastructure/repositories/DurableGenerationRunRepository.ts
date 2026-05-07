/**
 * Durable Generation Run Repository — Phase 2.
 *
 * Implements `IGenerationRunRepository` against the Hono Worker API.
 * This adapter translates the typed repository contract into HTTP calls
 * (`POST /v1/runs`, `GET /v1/runs/:id/events` SSE, etc.) using the
 * `ApiClient` and `sseClient` infrastructure primitives.
 *
 * ## Phase 2 scope
 *
 * All four pipeline kinds (`crystal-trial`, `topic-content`,
 * `topic-expansion`, `subject-graph`) are submitted to the Worker.
 * Topic Expansion includes `Supersedes-Key` header forwarding.
 *
 * ## Boundary rules
 *
 * This file is imported ONLY by `wireGenerationClient.ts`. Features,
 * components, and hooks must never import it directly (enforced by
 * `durableGenerationBoundary.test.ts`).
 */

import type { ArtifactEnvelope, RunEvent, RunStatus } from '@/features/generationContracts';
import type {
  CancelReason,
  IGenerationRunRepository,
  RunInput,
  RunListQuery,
  RunSnapshot,
} from '@/types/repository';
import type { ApiClient } from '../http/apiClient';
import { openSseStream } from '../http/sseClient';

export interface DurableGenerationRunRepositoryDeps {
  http: ApiClient;
  deviceId: string;
}

/**
 * Worker-side run row shape returned by `GET /v1/runs/:id` and
 * `GET /v1/runs`.
 */
interface WorkerRunRow {
  id: string;
  device_id: string;
  kind: string;
  status: string;
  input_hash: string;
  idempotency_key?: string | null;
  parent_run_id?: string | null;
  cancel_requested_at?: string | null;
  cancel_reason?: string | null;
  subject_id?: string | null;
  topic_id?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  snapshot_json: Record<string, unknown>;
  jobs?: WorkerJobRow[];
  events?: WorkerEventRow[];
}

interface WorkerJobRow {
  id: string;
  run_id: string;
  kind: string;
  stage: string;
  status: string;
  retry_of?: string | null;
  input_hash: string;
  model: string;
  metadata_json?: Record<string, unknown> | null;
  started_at?: string | null;
  finished_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
}

interface WorkerEventRow {
  id: number;
  run_id: string;
  seq: number;
  ts: string;
  type: string;
  payload_json: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function isoToEpoch(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}

function workerRunToSnapshot(row: WorkerRunRow): RunSnapshot {
  const jobs: import('@/types/repository').JobSnapshot[] = (row.jobs ?? []).map(
    (j) => ({
      jobId: j.id,
      kind: j.kind,
      stage: j.stage,
      status: mapWorkerJobStatus(j.status),
      retryOf: j.retry_of ?? undefined,
      inputHash: j.input_hash,
      model: j.model,
      metadata: j.metadata_json ?? undefined,
      startedAt: isoToEpoch(j.started_at),
      finishedAt: isoToEpoch(j.finished_at),
      errorCode: j.error_code ?? undefined,
      errorMessage: j.error_message ?? undefined,
    }),
  );

  return {
    runId: row.id,
    deviceId: row.device_id,
    kind: row.kind as RunSnapshot['kind'],
    status: mapWorkerRunStatus(row.status),
    inputHash: row.input_hash,
    parentRunId: row.parent_run_id ?? undefined,
    createdAt: isoToEpoch(row.created_at) ?? 0,
    startedAt: isoToEpoch(row.started_at),
    finishedAt: isoToEpoch(row.finished_at),
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    snapshotJson: row.snapshot_json as RunSnapshot['snapshotJson'],
    jobs,
  };
}

/**
 * Map a Worker-side run status to a canonical transport status.
 *
 * The backend now returns transport (hyphen-separated) statuses from
 * `GET /v1/runs`. This function handles both transport and legacy DB
 * (underscore) forms so the client is resilient to any format drift.
 */
function mapWorkerRunStatus(status: string): RunStatus {
  const DB_TO_TRANSPORT: Record<string, string> = {
    queued: 'queued',
    planning: 'planning',
    generating_stage: 'generating-stage',
    parsing: 'parsing',
    validating: 'validating',
    persisting: 'persisting',
    ready: 'ready',
    applied_local: 'applied-local',
    failed_final: 'failed-final',
    cancelled: 'cancelled',
  };
  return (DB_TO_TRANSPORT[status] ?? status) as RunStatus;
}

function mapWorkerJobStatus(
  status: string,
): 'queued' | 'streaming' | 'completed' | 'failed' | 'aborted' {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'streaming':
    case 'generating_stage':
      return 'streaming';
    case 'completed':
    case 'ready':
      return 'completed';
    case 'failed':
    case 'failed_final':
      return 'failed';
    case 'aborted':
    case 'cancelled':
      return 'aborted';
    default:
      return 'queued';
  }
}

export class DurableGenerationRunRepository implements IGenerationRunRepository {
  private readonly http: ApiClient;
  private readonly deviceId: string;

  constructor(deps: DurableGenerationRunRepositoryDeps) {
    this.http = deps.http;
    this.deviceId = deps.deviceId;
  }

  async submitRun(
    input: RunInput,
    idempotencyKey: string,
  ): Promise<{ runId: string }> {
    // All four pipeline kinds are supported in Phase 2.
    const body: Record<string, unknown> = {
      kind: input.pipelineKind,
      snapshot: input.snapshot,
    };

    const headers: Record<string, string> = {
      'idempotency-key': idempotencyKey,
    };

    // Topic Expansion forwards Supersedes-Key for server-side supersession.
    if (input.pipelineKind === 'topic-expansion') {
      const teInput = input as Extract<RunInput, { pipelineKind: 'topic-expansion' }>;
      const supersedesKey = `te-supersedes:${teInput.subjectId}:${teInput.topicId}`;
      headers['supersedes-key'] = supersedesKey;
    }

    const result = await this.http.post<{ runId: string }>('/v1/runs', body, { headers });
    return result;
  }

  async getRun(runId: string): Promise<RunSnapshot> {
    const row = await this.http.get<WorkerRunRow>(`/v1/runs/${runId}`);
    return workerRunToSnapshot(row);
  }

  async *streamRunEvents(
    runId: string,
    lastSeq?: number,
  ): AsyncIterable<RunEvent> {
    yield* openSseStream({
      baseUrl: this.http.baseUrl,
      deviceId: this.deviceId,
      path: `/v1/runs/${runId}/events`,
      lastEventId: lastSeq !== undefined ? String(lastSeq) : undefined,
    });
  }

  async cancelRun(runId: string, reason: CancelReason): Promise<void> {
    await this.http.post(`/v1/runs/${runId}/cancel`, { reason });
  }

  async retryRun(
    runId: string,
    opts?: { stage?: string; jobId?: string },
  ): Promise<{ runId: string }> {
    const result = await this.http.post<{ runId: string }>(
      `/v1/runs/${runId}/retry`,
      opts ?? {},
    );
    return result;
  }

  async listRuns(query: RunListQuery): Promise<RunSnapshot[]> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.kind) params.set('kind', query.kind);
    if (query.subjectId) params.set('subjectId', query.subjectId);
    if (query.topicId) params.set('topicId', query.topicId);
    if (query.limit !== undefined) params.set('limit', String(query.limit));

    const qs = params.toString();
    const result = await this.http.get<{ runs: WorkerRunRow[] }>(
      `/v1/runs${qs ? `?${qs}` : ''}`,
    );

    return (result.runs ?? []).map(workerRunToSnapshot);
  }

  async getArtifact(artifactId: string): Promise<ArtifactEnvelope> {
    const row = await this.http.get<{
      id: string;
      kind: string;
      inputHash: string;
      contentHash: string;
      schemaVersion: number;
      createdAt: string;
      payload: unknown;
    }>(`/v1/artifacts/${artifactId}`);

    return {
      kind: 'inline' as const,
      artifact: {
        id: row.id,
        kind: row.kind,
        contentHash: row.contentHash,
        inputHash: row.inputHash,
        schemaVersion: row.schemaVersion,
        createdByRunId: '',
        createdAt: row.createdAt,
        payload: row.payload,
      },
    } as ArtifactEnvelope;
  }
}
