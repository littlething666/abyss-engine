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
 *
 * Phase 3.6 P1 #2: Strict transport decoding — unknown event types and
 * malformed payloads throw at the adapter boundary. No fallback defaults.
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
    case 'run.status': {
      const rawStatus = String(p.status ?? '');
      if (!rawStatus) {
        throw new Error(
          `[sseClient] run.status event missing required field "status" (runId=${row.run_id}, seq=${row.seq})`,
        );
      }
      return { ...base, type: 'run.status', status: parseRunStatus(rawStatus) };
    }
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
    case 'run.artifact-ready': {
      const artifactId = String(p.artifactId ?? p.artifact_id ?? '');
      const kind = String(p.kind ?? '');
      const contentHash = String(p.contentHash ?? p.content_hash ?? '');
      const inputHash = String(p.inputHash ?? p.input_hash ?? '');
      const schemaVersion: number | undefined =
        typeof p.schemaVersion === 'number'
          ? p.schemaVersion
          : typeof p.schema_version === 'number'
            ? p.schema_version
            : undefined;

      // Phase 3.6 P1 #2: Fail loudly on missing required fields.
      const missing: string[] = [];
      if (!artifactId) missing.push('artifactId');
      if (!kind) missing.push('kind');
      if (!contentHash) missing.push('contentHash');
      if (!inputHash) missing.push('inputHash');
      if (schemaVersion === undefined) missing.push('schemaVersion');
      if (missing.length > 0) {
        throw new Error(
          `[sseClient] artifact.ready event missing required field(s): ${missing.join(', ')} (runId=${row.run_id}, seq=${row.seq})`,
        );
      }

      // TypeScript can't narrow across the throw above, but we've verified
      // schemaVersion is defined.
      return {
        ...base,
        type: 'artifact.ready',
        body: {
          artifactId,
          subjectId: typeof p.subject_id === 'string' ? p.subject_id : undefined,
          topicId: typeof p.topic_id === 'string' ? p.topic_id : undefined,
          kind,
          contentHash,
          schemaVersion: schemaVersion as number,
          inputHash,
        },
      };
    }
    case 'run.completed':
      return { ...base, type: 'run.completed' };
    case 'run.failed': {
      const raw = (p.code ?? p.error_code ?? '') as string;
      if (!raw) {
        throw new Error(
          `[sseClient] run.failed event missing required field "code" (runId=${row.run_id}, seq=${row.seq})`,
        );
      }
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
      // Phase 3.6 P1 #2: Unknown event types are a transport contract
      // violation — throw at the adapter boundary instead of silently
      // synthesising a fallback event.
      throw new Error(
        `[sseClient] unknown event type "${row.type}" (runId=${row.run_id}, seq=${row.seq}). ` +
        `This is a transport contract violation — the Worker emitted an event type the client does not recognise.`,
      );
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
              let row: WorkerEventRow;
              try {
                row = JSON.parse(currentData);
              } catch (err) {
                console.error('[sseClient] failed to parse SSE data:', err);
                currentEventId = undefined;
                currentData = '';
                continue;
              }
              yield rowToRunEvent(row);
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
            let row: WorkerEventRow;
            try {
              row = JSON.parse(currentData);
            } catch (err) {
              console.error('[sseClient] failed to parse SSE data:', err);
              currentEventId = undefined;
              currentData = '';
              continue;
            }
            yield rowToRunEvent(row);
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
