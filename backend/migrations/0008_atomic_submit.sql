-- 0008_atomic_submit.sql
-- Phase 3.6 fix — atomic idempotency + budget + run creation.
--
-- The current flow of `check idempotency → reserve budget → insert run →
-- record idempotency` has a race window: two concurrent submissions with
-- the same expired idempotency key can both pass the check, both reserve
-- budget, and both create runs. The losing idempotency record silently
-- no-ops while both runs and budget reservations remain.
--
-- This migration introduces `atomic_submit_run` — a single RPC that
-- serialises on the (device_id, idempotency_key) pair via
-- `pg_advisory_xact_lock`, then checks idempotency, reserves budget,
-- inserts the run row, and records the idempotency key — all in one
-- postgres transaction. The losing concurrent caller receives the winning
-- `runId` with no duplicate budget reservation or run row.
--
-- The existing `reserve_run_budget` and `check_idempotency` /
-- `record_idempotency_key` RPCs remain as lower-level primitives for
-- non-submit paths (retry, stats, etc.).

-- ---------------------------------------------------------------------------
-- atomic_submit_run — serialised submit that owns idempotency + budget + run.
-- ---------------------------------------------------------------------------
create or replace function atomic_submit_run(
  p_device_id uuid,
  p_idempotency_key text,
  p_kind text,
  p_input_hash text,
  p_status text,
  p_supersedes_key text default null,
  p_subject_id text default null,
  p_topic_id text default null,
  p_snapshot_json jsonb default '{}'::jsonb,
  p_parent_run_id uuid default null,
  p_run_cap integer default 10,
  p_token_cap bigint default 500000,
  p_started_at timestamptz default null,
  p_finished_at timestamptz default null,
  p_error_code text default null,
  p_error_message text default null
) returns jsonb
language plpgsql as $$
declare
  v_existing_run_id uuid;
  v_run_id uuid;
  v_day text;
  v_row usage_counters;
  v_tokens bigint;
begin
  -- ── Serialise on (device_id, idempotency_key) ──────────────────────
  -- Two concurrent calls with the same key will execute sequentially
  -- within this transaction. The second call finds the idempotency
  -- record inserted by the first and returns that runId.
  perform pg_advisory_xact_lock(hashtext(p_device_id::text || ':' || p_idempotency_key));

  -- ── 1. Check idempotency (24h TTL) ─────────────────────────────────
  select run_id into v_existing_run_id
  from idempotency_records
  where device_id = p_device_id and key = p_idempotency_key
    and expires_at > now();

  if found then
    return jsonb_build_object(
      'runId', v_existing_run_id,
      'status', 'hit',
      'existing', true
    );
  end if;

  -- Clean expired records so a fresh run can be created.
  delete from idempotency_records
  where device_id = p_device_id and key = p_idempotency_key;

  -- ── 2. Reserve budget ──────────────────────────────────────────────
  v_day := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');

  insert into usage_counters (device_id, day, runs_started, tokens_in, tokens_out)
  values (p_device_id, v_day, 0, 0, 0)
  on conflict (device_id, day) do nothing;

  select * into v_row
  from usage_counters
  where device_id = p_device_id and day = v_day
  for update;

  if v_row.runs_started >= p_run_cap then
    return jsonb_build_object(
      'status', 'budget_exceeded',
      'code', 'budget:over-cap',
      'message', format('daily run cap (%s) exceeded', p_run_cap)
    );
  end if;

  v_tokens := coalesce(v_row.tokens_in, 0) + coalesce(v_row.tokens_out, 0);
  if v_tokens >= p_token_cap then
    return jsonb_build_object(
      'status', 'budget_exceeded',
      'code', 'budget:over-cap',
      'message', format('daily token cap (%s) exceeded', p_token_cap)
    );
  end if;

  update usage_counters
  set runs_started = runs_started + 1
  where device_id = p_device_id and day = v_day;

  -- ── 3. Insert run ──────────────────────────────────────────────────
  v_run_id := gen_random_uuid();

  insert into runs (
    id, device_id, kind, status, input_hash, idempotency_key,
    parent_run_id, supersedes_key, subject_id, topic_id,
    snapshot_json, started_at, finished_at, error_code, error_message
  ) values (
    v_run_id, p_device_id, p_kind, p_status, p_input_hash, p_idempotency_key,
    p_parent_run_id, p_supersedes_key, p_subject_id, p_topic_id,
    p_snapshot_json, p_started_at, p_finished_at, p_error_code, p_error_message
  );

  -- ── 4. Record idempotency ──────────────────────────────────────────
  insert into idempotency_records (device_id, key, run_id, expires_at)
  values (p_device_id, p_idempotency_key, v_run_id, now() + interval '24 hours')
  on conflict (device_id, key) do nothing;

  return jsonb_build_object(
    'runId', v_run_id,
    'status', 'created',
    'existing', false
  );
end $$;
