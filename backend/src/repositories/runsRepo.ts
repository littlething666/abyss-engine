/**
 * Runs + jobs + events repository.
 *
 * All write paths go through this module. Every insert into the `events` table
 * is preceded by a call to `allocate_event_seq(run_id)` to guarantee monotonic
 * per-run sequence numbers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RunRow, JobRow, EventRow, CancelReason } from './types';
import type { TypedEventType, TypedEventPayloadMap } from '../contracts/typedEvents';

export interface IRunsRepo {
  // ---- runs ----
  insertRun(run: Omit<RunRow, 'created_at' | 'next_event_seq'>): Promise<RunRow>;
  load(runId: string): Promise<RunRow>;
  /** List runs for a device, optionally filtered by status / kind / subject / topic. */
  listByDevice(
    deviceId: string,
    opts?: { status?: string; kind?: string; subjectId?: string; topicId?: string; limit?: number },
  ): Promise<RunRow[]>;
  /**
   * Look up a run by (device_id, idempotency_key).
   * Returns the run id on hit, null on miss.
   */
  findByIdempotencyKey(deviceId: string, key: string): Promise<string | null>;
  /** Transition run status (sets started_at on first non-queued, finished_at on terminal). */
  transition(runId: string, status: RunRow['status']): Promise<void>;
  markReady(runId: string): Promise<void>;
  markFailed(runId: string, errorCode: string, errorMessage: string): Promise<void>;
  markCancelled(runId: string): Promise<void>;

  // ---- cooperative cancel ----
  /** Write cancel_requested_at + cancel_reason. Returns false if the run is already terminal. */
  requestCancel(runId: string, reason: CancelReason): Promise<boolean>;
  /** Returns the cancel reason if `cancel_requested_at` is non-null and `finished_at` is null. */
  cancelRequested(runId: string): Promise<CancelReason | null>;

  // ---- observability (Phase 3) ----
  /** List all runs created in the last N days (across all devices). Used by failure dashboard. */
  listInWindow(days: number): Promise<RunRow[]>;

  // ---- supersession (Phase 2) ----
  /**
   * Cancel any active run holding the same supersedes_key for this device.
   * Returns the prior run id if one was cancelled, null if nothing to cancel.
   * Called within a single transaction with insertRun for atomicity.
   */
  cancelSupersededRun(deviceId: string, supersedesKey: string): Promise<string | null>;

  // ---- events ----
  /** Append an event with an auto-allocated sequence number. */
  append(runId: string, deviceId: string, type: string, payload: Record<string, unknown>): Promise<EventRow>;
  /**
   * Append a typed event (Phase 3.6 Step 6).
   * The builder already returns { type, payload } — this overload
   * forwards them to the loose `append` for backward compatibility.
   */
  appendTyped<T extends TypedEventType>(
    runId: string,
    deviceId: string,
    event: { type: T; payload: Record<string, unknown> },
  ): Promise<EventRow>;
  /** Return events for a run with seq > lastSeq, ordered by seq ascending. */
  eventsAfter(runId: string, deviceId: string, lastSeq: number): Promise<EventRow[]>;

  // ---- jobs ----
  insertJob(job: Omit<JobRow, 'id'>): Promise<JobRow>;
}

export function createRunsRepo(db: SupabaseClient): IRunsRepo {
  return {
    async insertRun(run) {
      const { data, error } = await db
        .from('runs')
        .insert(run)
        .select('*')
        .single();

      if (error) throw error;
      return data as RunRow;
    },

    async load(runId: string) {
      const { data, error } = await db
        .from('runs')
        .select('*')
        .eq('id', runId)
        .single();

      if (error) throw error;
      return data as RunRow;
    },

    async findByIdempotencyKey(deviceId: string, key: string) {
      const { data, error } = await db
        .from('runs')
        .select('id')
        .eq('device_id', deviceId)
        .eq('idempotency_key', key)
        .maybeSingle();

      if (error) throw error;
      return data ? (data as { id: string }).id : null;
    },

    async listByDevice(deviceId: string, opts = {}) {
      let query = db.from('runs').select('*').eq('device_id', deviceId);

      if (opts.status === 'active') {
        query = query.in('status', ['queued', 'planning', 'generating_stage', 'parsing', 'validating', 'persisting']);
      } else if (opts.status === 'recent') {
        query = query.in('status', ['ready', 'failed_final', 'cancelled']).order('finished_at', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      if (opts.kind) query = query.eq('kind', opts.kind);
      if (opts.subjectId) query = query.eq('subject_id', opts.subjectId);
      if (opts.topicId) query = query.eq('topic_id', opts.topicId);
      if (opts.limit) query = query.limit(opts.limit);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as RunRow[];
    },

    async transition(runId: string, status: RunRow['status']) {
      const update: Record<string, unknown> = { status };

      // Set started_at on the first transition out of queued.
      const { data: current } = await db.from('runs').select('status, started_at').eq('id', runId).single();
      if (current && current.status === 'queued' && !current.started_at) {
        update.started_at = new Date().toISOString();
      }

      // Set finished_at on terminal statuses.
      if (['ready', 'failed_final', 'cancelled'].includes(status)) {
        update.finished_at = new Date().toISOString();
      }

      const { error } = await db.from('runs').update(update).eq('id', runId);
      if (error) throw error;
    },

    async markReady(runId: string) {
      await this.transition(runId, 'ready');
    },

    async markFailed(runId: string, errorCode: string, errorMessage: string) {
      const { error } = await db.from('runs').update({
        status: 'failed_final',
        error_code: errorCode,
        error_message: errorMessage,
        finished_at: new Date().toISOString(),
      }).eq('id', runId);
      if (error) throw error;
    },

    async markCancelled(runId: string) {
      const { error } = await db.from('runs').update({
        status: 'cancelled',
        finished_at: new Date().toISOString(),
      }).eq('id', runId);
      if (error) throw error;
    },

    async requestCancel(runId: string, reason: CancelReason) {
      // Only write if the run hasn't finished yet.
      const { data: current } = await db
        .from('runs')
        .select('finished_at')
        .eq('id', runId)
        .maybeSingle();

      if (!current || (current as { finished_at: string | null }).finished_at) {
        return false;
      }

      const { error } = await db.from('runs').update({
        cancel_requested_at: new Date().toISOString(),
        cancel_reason: reason,
      }).eq('id', runId);

      if (error) throw error;
      return true;
    },

    async cancelSupersededRun(deviceId: string, supersedesKey: string) {
      // Find the active run holding the same supersedes_key.
      const { data: existing } = await db
        .from('runs')
        .select('id, finished_at')
        .eq('device_id', deviceId)
        .eq('supersedes_key', supersedesKey)
        .in('status', ['queued', 'planning', 'generating_stage', 'parsing', 'validating', 'persisting'])
        .maybeSingle();

      if (!existing) return null;

      const priorRunId = (existing as { id: string }).id;

      // Write cancel_requested_at + cancel_reason = 'superseded'.
      const { error } = await db.from('runs').update({
        cancel_requested_at: new Date().toISOString(),
        cancel_reason: 'superseded',
      }).eq('id', priorRunId);

      if (error) throw error;
      return priorRunId;
    },

    async cancelRequested(runId: string) {
      const { data, error } = await db
        .from('runs')
        .select('cancel_requested_at, cancel_reason, finished_at')
        .eq('id', runId)
        .single();

      if (error) throw error;
      if (data && data.cancel_requested_at && !data.finished_at) {
        return data.cancel_reason as CancelReason;
      }
      return null;
    },

    async append(runId: string, deviceId: string, type: string, payload: Record<string, unknown>) {
      // Allocate the next sequence number atomically.
      const { data: seqData, error: seqError } = await db
        .rpc('allocate_event_seq', { p_run_id: runId });

      if (seqError) throw seqError;
      const seq: number = seqData as unknown as number;

      const { data, error } = await db
        .from('events')
        .insert({
          run_id: runId,
          device_id: deviceId,
          seq,
          type,
          payload_json: payload,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data as EventRow;
    },

    async appendTyped(runId, deviceId, event) {
      return this.append(runId, deviceId, event.type, event.payload);
    },

    async eventsAfter(runId: string, deviceId: string, lastSeq: number) {
      const { data, error } = await db
        .from('events')
        .select('*')
        .eq('run_id', runId)
        .eq('device_id', deviceId)
        .gt('seq', lastSeq)
        .order('seq', { ascending: true });

      if (error) throw error;
      return (data ?? []) as EventRow[];
    },

    async listInWindow(days: number) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await db
        .from('runs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;
      return (data ?? []) as RunRow[];
    },

    async insertJob(job) {
      const { data, error } = await db
        .from('jobs')
        .insert(job)
        .select('*')
        .single();

      if (error) throw error;
      return data as JobRow;
    },
  };
}
