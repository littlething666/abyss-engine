-- 0001_init.sql
-- Phase 1 Durable Orchestrator — Supabase Postgres schema.
-- Applied via `supabase db push` from the `backend/` workspace.
-- Service-role only; the browser never holds these credentials.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- devices — one row per browser device fingerprint.
-- `user_id` is NULL until Supabase Auth migration (Phase 4).
-- ---------------------------------------------------------------------------
create table devices (
  id uuid primary key,
  user_id uuid null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- runs — top-level orchestration unit. One run = one pipeline invocation
-- (e.g. one Crystal Trial generation request).
--
-- Status lifecycle: queued → planning → generating_stage → parsing →
-- validating → persisting → ready → applied_local (client-side cache write;
-- not persisted on the server — `ready` is the server-side terminal).
-- Terminal states: failed_final, cancelled.
-- ---------------------------------------------------------------------------
create table runs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id),
  kind text not null check (kind in (
    'topic-content', 'topic-expansion', 'subject-graph', 'crystal-trial'
  )),
  status text not null check (status in (
    'queued','planning','generating_stage','parsing','validating',
    'persisting','ready','applied_local','failed_final','cancelled'
  )),
  input_hash text not null,
  idempotency_key text null,
  parent_run_id uuid null references runs(id),
  cancel_requested_at timestamptz null,
  cancel_reason text null check (cancel_reason in ('user','superseded') or cancel_reason is null),
  subject_id text null,
  topic_id text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  error_code text null,
  error_message text null,
  snapshot_json jsonb not null,
  next_event_seq integer not null default 0
);

-- ---------------------------------------------------------------------------
-- jobs — individual stages within a run (e.g. the single Crystal Trial LLM
-- call, or per-stage Topic Content jobs).
-- ---------------------------------------------------------------------------
create table jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  kind text not null,
  stage text not null,
  status text not null,
  retry_of uuid null references jobs(id),
  input_hash text not null,
  model text not null,
  metadata_json jsonb null,
  started_at timestamptz null,
  finished_at timestamptz null,
  error_code text null,
  error_message text null
);

-- ---------------------------------------------------------------------------
-- events — monotonic per-run event log. `seq` is allocated atomically via
-- `allocate_event_seq(run_id)`. SSE replays from `seq > lastSeq`.
-- ---------------------------------------------------------------------------
create table events (
  id bigserial primary key,
  run_id uuid not null references runs(id) on delete cascade,
  device_id uuid not null references devices(id),
  seq integer not null,
  ts timestamptz not null default now(),
  type text not null,
  payload_json jsonb not null,
  unique (run_id, seq)
);

-- ---------------------------------------------------------------------------
-- artifacts — JSON artifact envelopes keyed by (device_id, kind, input_hash).
-- Stored in Supabase Storage; this table maps the storage key to metadata.
-- ---------------------------------------------------------------------------
create table artifacts (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id),
  created_by_run_id uuid not null references runs(id),
  kind text not null,
  input_hash text not null,
  storage_key text not null,
  content_hash text not null,
  schema_version integer not null,
  created_at timestamptz not null default now(),
  unique (device_id, kind, input_hash)
);

-- ---------------------------------------------------------------------------
-- usage_counters — per-device daily token and run budgets.
-- `day` is YYYY-MM-DD UTC (Plan v3 Q15).
-- ---------------------------------------------------------------------------
create table usage_counters (
  device_id uuid not null references devices(id),
  day text not null,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  runs_started integer not null default 0,
  primary key (device_id, day)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_runs_device_status_created on runs(device_id, status, created_at desc);
create unique index idx_runs_device_idempotency on runs(device_id, idempotency_key) where idempotency_key is not null;
create index idx_runs_device_kind_input_hash on runs(device_id, kind, input_hash);
create index idx_jobs_run on jobs(run_id);
create index idx_events_run_seq on events(run_id, seq);

-- ---------------------------------------------------------------------------
-- allocate_event_seq — atomic, concurrency-safe seq allocator.
-- Used by the Worker's emit step before every `events` insert.
-- ---------------------------------------------------------------------------
create or replace function allocate_event_seq(p_run_id uuid) returns integer
language plpgsql as $$
declare v_next integer;
begin
  update runs set next_event_seq = next_event_seq + 1
  where id = p_run_id
  returning next_event_seq into v_next;
  return v_next;
end $$;

-- ---------------------------------------------------------------------------
-- increment_runs_started — atomic daily run counter bump.
-- Creates the row if it doesn't exist (INSERT … ON CONFLICT DO UPDATE).
-- ---------------------------------------------------------------------------
create or replace function increment_runs_started(p_device_id uuid, p_day text) returns void
language plpgsql as $$
begin
  insert into usage_counters (device_id, day, runs_started)
  values (p_device_id, p_day, 1)
  on conflict (device_id, day)
  do update set runs_started = usage_counters.runs_started + 1;
end $$;

-- ---------------------------------------------------------------------------
-- record_tokens — atomic daily token counter update.
-- Creates the row if it doesn't exist.
-- ---------------------------------------------------------------------------
create or replace function record_tokens(
  p_device_id uuid,
  p_day text,
  p_tokens_in bigint,
  p_tokens_out bigint
) returns void
language plpgsql as $$
begin
  insert into usage_counters (device_id, day, tokens_in, tokens_out)
  values (p_device_id, p_day, p_tokens_in, p_tokens_out)
  on conflict (device_id, day)
  do update set
    tokens_in = usage_counters.tokens_in + p_tokens_in,
    tokens_out = usage_counters.tokens_out + p_tokens_out;
end $$;
