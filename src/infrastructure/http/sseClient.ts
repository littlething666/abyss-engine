/**
 * SSE (Server-Sent Events) stream client for durable run event streaming.
 *
 * Phase 1 PR-E: Opens an SSE connection to the Worker's
 * `GET /v1/runs/:id/events` endpoint, yields typed `RunEvent`s,
 * and supports resumption via `Last-Event-ID`.
 *
 * Protocol: The Worker sends SSE frames with:
 *   - `id: <seq>`  (monotonic per-run sequence number)
 *   - `data: <json>`  (the serialized event row)
 *   - `:` lines are keepalive comments (ignored)
 *
 * This client is consumed ONLY by `DurableGenerationRunRepository`;
 * it must never be imported by features, components, or hooks
 * (enforced by `durableGenerationBoundary.test.ts`).
 */

import { parseRunStatus } from '@/features/generationContracts';
import type {
  RunEvent,
  RunStatus,
  ArtifactReadyEventBody,
  GenerationFailureCode,
} from '@/features/generationContracts';

export interface SseStreamOptions {
  /** Base URL of the Worker. */
  baseUrl: string;
  /** Per-device identity. */
  deviceId: string;
  /** SSE endpoint path (e.g. `/v1/runs/:id/events`). */
  path: string;
  /** Resume after this seq. Omit to start from the run's first event. */
  lastEventId?: string;
  /** AbortSignal for cancelling the connection. */
  signal?: AbortSignal;
}

/**
 * Worker-side event row from the SSE stream (before reconstitution
 * into a typed `RunEvent`).
 *
 * The Worker `events` table columns differ from the client-facing
 * `RunEvent` discriminated union, so we normalize here.
 */
interface WorkerEventRow {
  id: number;
  run_id: string;
  device_id: string;
  seq: number;
  ts: string;
  type: string;
  payload_json: Record<string, unknown>;
}

/**
 * Reconstitute a `WorkerEventRow` into a typed `RunEvent`.
 *
 * The Worker stores event types in `events.type` using the canonical
 * dotted names (e.g. `'run.queued'`, `'artifact.ready'`, `'run.failed'`).
 */
function rowToRunEvent(row: WorkerEventRow): RunEvent {
  const base = {
    runId: row.run_id,
    seq: row.seq,
    ts: row.ts,
  };

  const p = row.payload_json ?? {};
  switch (row.type) {
    case 'run.queued':
      return { ...base, type: 'run.queued' };
    case 'run.status':
      return { ...base, type: 'run.status', status: parseRunStatus(String(p.status ?? 'queued')) };
    case 'stage.progress':
      return {
        ...base,
        type: 'stage.progress',
        body: {
          stage: (p.stage ?? '') as string,
          progress: typeof p.progress === 'number' ? p.progress : undefined,
        },
      };
    case 'artifact.ready':
    case 'run.artifact-ready':
      return {
        ...base,
        type: 'artifact.ready',
        body: {
          artifactId: String(p.artifactId ?? p.artifact_id ?? ''),
          subjectId: typeof p.subject_id === 'string' ? p.subject_id : undefined,
          topicId: typeof p.topic_id === 'string' ? p.topic_id : undefined,
          kind: String(p.kind ?? ''),
          contentHash: String(p.contentHash ?? p.content_hash ?? ''),
          schemaVersion:
            typeof p.schemaVersion === 'number'
              ? p.schemaVersion
              : typeof p.schema_version === 'number'
                ? p.schema_version
                : 0,
          inputHash: String(p.inputHash ?? p.input_hash ?? ''),
        },
      };
    case 'run.completed':
      return { ...base, type: 'run.completed' };
    case 'run.failed': {
      const raw = (p.code ?? p.error_code ?? 'parse:json-mode-violation') as string;
      const code = (
        raw === 'validation:semantic-subject-graph'
          ? 'validation:semantic-subject-graph'
          : raw
      ) as GenerationFailureCode;
      return {
        ...base,
        type: 'run.failed',
        code,
        message: String(p.message ?? p.error_message ?? ''),
      };
    }
    case 'run.cancel-acknowledged':
      return {
        ...base,
        type: 'run.cancel-acknowledged',
        reason: (p.reason === 'superseded' ? 'superseded' : 'user') as 'user' | 'superseded',
      };
    case 'run.cancelled':
      return {
        ...base,
        type: 'run.cancelled',
        reason: (p.reason === 'superseded' ? 'superseded' : 'user') as 'user' | 'superseded',
      };
    default: {
      // Unknown event type — log and continue.
      // Future event types from the Worker must be added to this switch.
      console.warn(`[sseClient] unknown event type: ${row.type}`, row);
      return {
        ...base,
        type: 'run.status',
        status: parseRunStatus(String(p.status ?? 'queued')),
      };
    }
  }
}

/**
 * Open an SSE stream and yield typed `RunEvent`s.
 */
export async function* openSseStream(
  opts: SseStreamOptions,
): AsyncIterable<RunEvent> {
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  const url = new URL(`${baseUrl}${opts.path}`);
  if (opts.lastEventId) {
    url.searchParams.set('lastSeq', opts.lastEventId);
  }

  const headers: Record<string, string> = {
    'x-abyss-device': opts.deviceId,
    accept: 'text/event-stream',
    'cache-control': 'no-cache',
  };
  if (opts.lastEventId) {
    headers['last-event-id'] = opts.lastEventId;
  }

  const res = await fetch(url.toString(), {
    headers,
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(`SSE connection failed: HTTP ${res.status}`);
  }

  if (!res.body) {
    throw new Error('SSE response has no body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    let currentEventId: string | undefined;
    let currentData = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush the remaining buffer. Append a final newline so the
        // last event's terminating blank line is processed.
        buffer += '\n';
        const finalLines = buffer.split('\n');
        for (const line of finalLines) {
          if (line.startsWith('id:')) {
            currentEventId = line.slice(3).trim();
          } else if (line.startsWith('data:')) {
            currentData += line.slice(5);
          } else if (line === '') {
            if (currentData.trim()) {
              try {
                const row: WorkerEventRow = JSON.parse(currentData);
                yield rowToRunEvent(row);
              } catch (err) {
                console.error('[sseClient] failed to parse SSE data:', err);
              }
            }
            currentEventId = undefined;
            currentData = '';
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      // The last element may be incomplete — keep it in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('id:')) {
          currentEventId = line.slice(3).trim();
        } else if (line.startsWith('data:')) {
          currentData += line.slice(5);
        } else if (line === '') {
          // Empty line = end of event
          if (currentData.trim()) {
            try {
              const row: WorkerEventRow = JSON.parse(currentData);
              yield rowToRunEvent(row);
            } catch (err) {
              console.error('[sseClient] failed to parse SSE data:', err);
            }
          }
          // Reset for next event
          currentEventId = undefined;
          currentData = '';
        }
        // Lines starting with ':' are comments/keepalives — ignore
      }
    }
  } finally {
    reader.releaseLock();
  }
}
