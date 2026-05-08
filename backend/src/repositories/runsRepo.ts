/**
 * Runs + jobs + events repository backed by Cloudflare D1.
 *
 * All JSON columns are serialized/deserialized at this adapter boundary.
 */

import type { RunRow, JobRow, EventRow, CancelReason, PipelineKind } from './types';
import type { TypedEventType } from '../contracts/typedEvents';
import { nowIso, parseJsonObject, stringifyJson } from './d1';

interface RawRunRow extends Omit<RunRow, 'snapshot_json'> { snapshot_json: string; }
interface RawEventRow extends Omit<EventRow, 'id' | 'payload_json'> { id: number | string; payload_json: string; }
interface RawJobRow extends Omit<JobRow, 'metadata_json'> { metadata_json: string | null; }

export interface AtomicSubmitRunInput {
  deviceId: string;
  idempotencyKey: string;
  kind: PipelineKind;
  inputHash: string;
  status: RunRow['status'];
  supersedesKey: string | null;
  subjectId: string | null;
  topicId: string | null;
  snapshotJson: Record<string, unknown>;
  parentRunId: string | null;
  runCap: number;
  tokenCap: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface AtomicSubmitRunResult {
  runId?: string;
  status: 'created' | 'hit' | 'budget_exceeded';
  existing: boolean;
  code?: string;
  message?: string;
}

export interface IRunsRepo {
  insertRun(run: Omit<RunRow, 'created_at' | 'next_event_seq'>): Promise<RunRow>;
  atomicSubmitRun(input: AtomicSubmitRunInput): Promise<AtomicSubmitRunResult>;
  load(runId: string): Promise<RunRow>;
  listByDevice(
    deviceId: string,
    opts?: { status?: string; kind?: string; subjectId?: string; topicId?: string; limit?: number },
  ): Promise<RunRow[]>;
  findByIdempotencyKey(deviceId: string, key: string): Promise<string | null>;
  transition(runId: string, status: RunRow['status']): Promise<void>;
  markReady(runId: string): Promise<void>;
  markFailed(runId: string, errorCode: string, errorMessage: string): Promise<void>;
  markCancelled(runId: string): Promise<void>;
  requestCancel(runId: string, reason: CancelReason): Promise<boolean>;
  cancelRequested(runId: string): Promise<CancelReason | null>;
  listInWindow(days: number): Promise<RunRow[]>;
  cancelSupersededRun(deviceId: string, supersedesKey: string): Promise<string | null>;
  append(runId: string, deviceId: string, type: string, payload: Record<string, unknown>): Promise<EventRow>;
  appendOnce(runId: string, deviceId: string, semanticKey: string, type: string, payload: Record<string, unknown>): Promise<EventRow>;
  appendTyped<T extends TypedEventType>(
    runId: string,
    deviceId: string,
    event: { type: T; payload: Record<string, unknown> },
  ): Promise<EventRow>;
  appendTypedOnce<T extends TypedEventType>(
    runId: string,
    deviceId: string,
    semanticKey: string,
    event: { type: T; payload: Record<string, unknown> },
  ): Promise<EventRow>;
  eventsAfter(runId: string, deviceId: string, lastSeq: number): Promise<EventRow[]>;
  insertJob(job: Omit<JobRow, 'id'>): Promise<JobRow>;
}

function runFromRow(row: RawRunRow): RunRow {
  return { ...row, snapshot_json: parseJsonObject(row.snapshot_json, 'runs.snapshot_json') };
}

function eventFromRow(row: RawEventRow): EventRow {
  return {
    ...row,
    id: String(row.id),
    payload_json: parseJsonObject(row.payload_json, 'events.payload_json'),
    semantic_key: row.semantic_key ?? null,
  };
}

function jobFromRow(row: RawJobRow): JobRow {
  return {
    ...row,
    metadata_json: row.metadata_json === null ? null : parseJsonObject(row.metadata_json, 'jobs.metadata_json'),
  };
}

function changes(result: unknown): number {
  return (result as { meta?: { changes?: number } }).meta?.changes ?? 0;
}

function expiryFrom(now: string): string {
  return new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export function createRunsRepo(db: D1Database): IRunsRepo {
  return {
    async insertRun(run) {
      const createdAt = nowIso();
      const row = await db.prepare(`
        insert into runs (
          id, device_id, kind, status, input_hash, idempotency_key,
          parent_run_id, supersedes_key, cancel_requested_at, cancel_reason,
          subject_id, topic_id, created_at, started_at, finished_at,
          error_code, error_message, snapshot_json, next_event_seq
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        returning *
      `).bind(
        run.id,
        run.device_id,
        run.kind,
        run.status,
        run.input_hash,
        run.idempotency_key,
        run.parent_run_id,
        run.supersedes_key,
        run.cancel_requested_at,
        run.cancel_reason,
        run.subject_id,
        run.topic_id,
        createdAt,
        run.started_at,
        run.finished_at,
        run.error_code,
        run.error_message,
        stringifyJson(run.snapshot_json, 'runs.snapshot_json'),
      ).first<RawRunRow>();

      if (!row) throw new Error('D1 runs.insertRun: failed to return run row');
      return runFromRow(row);
    },

    async atomicSubmitRun(input) {
      const now = nowIso();
      const runId = crypto.randomUUID();
      const expiresAt = expiryFrom(now);
      const snapshot = stringifyJson(input.snapshotJson, 'runs.snapshot_json');

      const results = await db.batch([
        db.prepare('delete from idempotency_records where device_id = ? and key = ? and expires_at <= ?')
          .bind(input.deviceId, input.idempotencyKey, now),
        db.prepare(`
          insert or ignore into usage_counters (device_id, day, tokens_in, tokens_out, runs_started)
          values (?, ?, 0, 0, 0)
        `).bind(input.deviceId, now.slice(0, 10)),
        db.prepare(`
          insert or ignore into idempotency_records (device_id, key, run_id, created_at, expires_at)
          values (?, ?, ?, ?, ?)
        `).bind(input.deviceId, input.idempotencyKey, runId, now, expiresAt),
        db.prepare(`
          update usage_counters
          set runs_started = runs_started + 1
          where device_id = ? and day = ?
            and runs_started < ?
            and (tokens_in + tokens_out) < ?
            and changes() = 1
        `).bind(input.deviceId, now.slice(0, 10), input.runCap, input.tokenCap),
        db.prepare(`
          insert into runs (
            id, device_id, kind, status, input_hash, idempotency_key,
            parent_run_id, supersedes_key, subject_id, topic_id,
            created_at, started_at, finished_at, error_code, error_message,
            snapshot_json, next_event_seq
          )
          select ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0
          where changes() = 1
        `).bind(
          runId,
          input.deviceId,
          input.kind,
          input.status,
          input.inputHash,
          input.idempotencyKey,
          input.parentRunId,
          input.supersedesKey,
          input.subjectId,
          input.topicId,
          now,
          input.startedAt,
          input.finishedAt,
          input.errorCode ?? null,
          input.errorMessage ?? null,
          snapshot,
        ),
      ]);

      const idempotencyInserted = changes(results[2]);
      const runInserted = changes(results[4]);

      if (idempotencyInserted === 0) {
        const existing = await db.prepare(`
          select run_id from idempotency_records
          where device_id = ? and key = ? and expires_at > ?
        `).bind(input.deviceId, input.idempotencyKey, now).first<{ run_id: string }>();
        if (!existing) {
          throw new Error('D1 runs.atomicSubmitRun: idempotency insert ignored but no live record exists');
        }
        return { runId: existing.run_id, status: 'hit', existing: true };
      }

      if (runInserted === 0) {
        await db.prepare('delete from idempotency_records where device_id = ? and key = ? and run_id = ?')
          .bind(input.deviceId, input.idempotencyKey, runId)
          .run();
        return {
          status: 'budget_exceeded',
          existing: false,
          code: 'budget:over-cap',
          message: 'daily run or token cap exceeded',
        };
      }

      return { runId, status: 'created', existing: false };
    },

    async load(runId) {
      const row = await db.prepare('select * from runs where id = ?').bind(runId).first<RawRunRow>();
      if (!row) throw new Error(`D1 runs.load: run not found: ${runId}`);
      return runFromRow(row);
    },

    async findByIdempotencyKey(deviceId, key) {
      const row = await db.prepare(`
        select run_id from idempotency_records
        where device_id = ? and key = ? and expires_at > ?
      `).bind(deviceId, key, nowIso()).first<{ run_id: string }>();
      return row?.run_id ?? null;
    },

    async listByDevice(deviceId, opts = {}) {
      const clauses = ['device_id = ?'];
      const binds: unknown[] = [deviceId];
      let order = 'created_at desc';

      // `active` / `recent` narrow lifecycle; `all` or omitted → full device history (created_at desc).
      if (opts.status === 'active') {
        clauses.push("status in ('queued','planning','generating_stage','parsing','validating','persisting')");
      } else if (opts.status === 'recent') {
        clauses.push("status in ('ready','failed_final','cancelled')");
        order = 'finished_at desc';
      }
      if (opts.kind) { clauses.push('kind = ?'); binds.push(opts.kind); }
      if (opts.subjectId) { clauses.push('subject_id = ?'); binds.push(opts.subjectId); }
      if (opts.topicId) { clauses.push('topic_id = ?'); binds.push(opts.topicId); }
      const limit = Math.max(1, Math.min(opts.limit ?? 100, 500));

      const { results } = await db.prepare(`
        select * from runs where ${clauses.join(' and ')} order by ${order} limit ?
      `).bind(...binds, limit).all<RawRunRow>();
      return (results ?? []).map(runFromRow);
    },

    async transition(runId, status) {
      const current = await this.load(runId);
      const update: Record<string, unknown> = { status };
      if (current.status === 'queued' && !current.started_at) update.started_at = nowIso();
      if (['ready', 'failed_final', 'cancelled'].includes(status)) update.finished_at = nowIso();

      const assignments = Object.keys(update).map((key) => `${key} = ?`).join(', ');
      await db.prepare(`update runs set ${assignments} where id = ?`)
        .bind(...Object.values(update), runId)
        .run();
    },

    async markReady(runId) { await this.transition(runId, 'ready'); },

    async markFailed(runId, errorCode, errorMessage) {
      await db.prepare(`
        update runs set status = 'failed_final', error_code = ?, error_message = ?, finished_at = ?
        where id = ?
      `).bind(errorCode, errorMessage, nowIso(), runId).run();
    },

    async markCancelled(runId) {
      await db.prepare("update runs set status = 'cancelled', finished_at = ? where id = ?")
        .bind(nowIso(), runId)
        .run();
    },

    async requestCancel(runId, reason) {
      const result = await db.prepare(`
        update runs set cancel_requested_at = ?, cancel_reason = ?
        where id = ? and finished_at is null
      `).bind(nowIso(), reason, runId).run();
      return changes(result) > 0;
    },

    async cancelSupersededRun(deviceId, supersedesKey) {
      const existing = await db.prepare(`
        select id from runs
        where device_id = ? and supersedes_key = ?
          and status in ('queued','planning','generating_stage','parsing','validating','persisting')
        order by created_at desc
        limit 1
      `).bind(deviceId, supersedesKey).first<{ id: string }>();
      if (!existing) return null;

      await db.prepare(`
        update runs set cancel_requested_at = ?, cancel_reason = 'superseded'
        where id = ?
      `).bind(nowIso(), existing.id).run();
      return existing.id;
    },

    async cancelRequested(runId) {
      const row = await db.prepare(`
        select cancel_requested_at, cancel_reason, finished_at from runs where id = ?
      `).bind(runId).first<{ cancel_requested_at: string | null; cancel_reason: CancelReason | null; finished_at: string | null }>();
      if (row?.cancel_requested_at && !row.finished_at) return row.cancel_reason;
      return null;
    },

    async append(runId, deviceId, type, payload) {
      const seqRow = await db.prepare(`
        update runs set next_event_seq = next_event_seq + 1
        where id = ?
        returning next_event_seq
      `).bind(runId).first<{ next_event_seq: number }>();
      if (!seqRow) throw new Error(`D1 runs.append: cannot allocate event seq for run ${runId}`);

      const row = await db.prepare(`
        insert into events (run_id, device_id, seq, ts, type, payload_json, semantic_key)
        values (?, ?, ?, ?, ?, ?, null)
        returning *
      `).bind(runId, deviceId, seqRow.next_event_seq, nowIso(), type, stringifyJson(payload, 'events.payload_json'))
        .first<RawEventRow>();
      if (!row) throw new Error('D1 runs.append: failed to return event row');
      return eventFromRow(row);
    },

    async appendOnce(runId, deviceId, semanticKey, type, payload) {
      const existing = await db.prepare(`
        select * from events
        where run_id = ? and semantic_key = ?
      `).bind(runId, semanticKey).first<RawEventRow>();
      if (existing) return eventFromRow(existing);

      const seqRow = await db.prepare(`
        update runs set next_event_seq = next_event_seq + 1
        where id = ?
          and not exists (
            select 1 from events where run_id = ? and semantic_key = ?
          )
        returning next_event_seq
      `).bind(runId, runId, semanticKey).first<{ next_event_seq: number }>();

      if (!seqRow) {
        const replayed = await db.prepare(`
          select * from events
          where run_id = ? and semantic_key = ?
        `).bind(runId, semanticKey).first<RawEventRow>();
        if (replayed) return eventFromRow(replayed);
        throw new Error(`D1 runs.appendOnce: cannot allocate event seq for run ${runId}`);
      }

      const row = await db.prepare(`
        insert into events (run_id, device_id, seq, ts, type, payload_json, semantic_key)
        values (?, ?, ?, ?, ?, ?, ?)
        on conflict(run_id, semantic_key) do nothing
        returning *
      `).bind(runId, deviceId, seqRow.next_event_seq, nowIso(), type, stringifyJson(payload, 'events.payload_json'), semanticKey)
        .first<RawEventRow>();
      if (row) return eventFromRow(row);

      const replayed = await db.prepare(`
        select * from events
        where run_id = ? and semantic_key = ?
      `).bind(runId, semanticKey).first<RawEventRow>();
      if (!replayed) throw new Error('D1 runs.appendOnce: insert conflict but no existing event row');
      return eventFromRow(replayed);
    },

    async appendTyped(runId, deviceId, event) {
      return this.append(runId, deviceId, event.type, event.payload);
    },

    async appendTypedOnce(runId, deviceId, semanticKey, event) {
      return this.appendOnce(runId, deviceId, semanticKey, event.type, event.payload);
    },

    async eventsAfter(runId, deviceId, lastSeq) {
      const { results } = await db.prepare(`
        select * from events
        where run_id = ? and device_id = ? and seq > ?
        order by seq asc
      `).bind(runId, deviceId, lastSeq).all<RawEventRow>();
      return (results ?? []).map(eventFromRow);
    },

    async listInWindow(days) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { results } = await db.prepare(`
        select * from runs where created_at >= ? order by created_at desc limit 1000
      `).bind(since).all<RawRunRow>();
      return (results ?? []).map(runFromRow);
    },

    async insertJob(job) {
      const row = await db.prepare(`
        insert into jobs (
          id, run_id, kind, stage, status, retry_of, input_hash, model,
          metadata_json, started_at, finished_at, error_code, error_message
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        returning *
      `).bind(
        crypto.randomUUID(),
        job.run_id,
        job.kind,
        job.stage,
        job.status,
        job.retry_of,
        job.input_hash,
        job.model,
        job.metadata_json === null ? null : stringifyJson(job.metadata_json, 'jobs.metadata_json'),
        job.started_at,
        job.finished_at,
        job.error_code,
        job.error_message,
      ).first<RawJobRow>();
      if (!row) throw new Error('D1 runs.insertJob: failed to return job row');
      return jobFromRow(row);
    },
  };
}
