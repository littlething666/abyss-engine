-- Abyss Engine hosted Supabase init script.
--
-- Unreleased-app posture: this is the single canonical database init script.
-- For a clean hosted Supabase project, paste this whole file into the SQL
-- editor and run it once. For an existing development database, run
-- backend/db/reset.sql first, then run this file.
--
-- Artifact JSON blobs live in Cloudflare R2. Supabase Postgres stores only
-- artifact metadata and learning-content read models.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Core durable-run state.
-- ---------------------------------------------------------------------------
create table devices (
  id uuid primary key,
  user_id uuid null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id) on delete cascade,
  kind text not null check (kind in (
    'topic-content', 'topic-expansion', 'subject-graph', 'crystal-trial'
  )),
  status text not null check (status in (
    'queued','planning','generating_stage','parsing','validating',
    'persisting','ready','applied_local','failed_final','cancelled'
  )),
  input_hash text not null,
  idempotency_key text null,
  parent_run_id uuid null references runs(id) on delete set null,
  supersedes_key text null,
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

create table jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  kind text not null,
  stage text not null,
  status text not null,
  retry_of uuid null references jobs(id) on delete set null,
  input_hash text not null,
  model text not null,
  metadata_json jsonb null,
  started_at timestamptz null,
  finished_at timestamptz null,
  error_code text null,
  error_message text null
);

create table events (
  id bigserial primary key,
  run_id uuid not null references runs(id) on delete cascade,
  device_id uuid not null references devices(id) on delete cascade,
  seq integer not null,
  ts timestamptz not null default now(),
  type text not null,
  payload_json jsonb not null,
  unique (run_id, seq)
);

create table artifacts (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id) on delete cascade,
  created_by_run_id uuid not null references runs(id) on delete cascade,
  kind text not null,
  input_hash text not null,
  storage_key text not null,
  content_hash text not null,
  schema_version integer not null,
  created_at timestamptz not null default now(),
  unique (device_id, kind, input_hash)
);

create table usage_counters (
  device_id uuid not null references devices(id) on delete cascade,
  day text not null,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  runs_started integer not null default 0,
  primary key (device_id, day)
);

create table stage_checkpoints (
  run_id uuid not null references runs(id) on delete cascade,
  stage text not null,
  status text not null check (
    status in ('pending','generating','parsing','validating','persisting','ready','failed')
  ),
  artifact_id uuid null references artifacts(id) on delete set null,
  job_id uuid null references jobs(id) on delete set null,
  input_hash text not null,
  attempt integer not null default 0,
  started_at timestamptz null,
  finished_at timestamptz null,
  error_code text null,
  error_message text null,
  primary key (run_id, stage)
);

create table idempotency_records (
  device_id uuid not null references devices(id) on delete cascade,
  key text not null,
  run_id uuid not null references runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (device_id, key)
);

-- ---------------------------------------------------------------------------
-- Backend-authoritative Learning Content Store.
-- ---------------------------------------------------------------------------
create table subjects (
  device_id uuid not null references devices(id) on delete cascade,
  subject_id text not null,
  title text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  content_source text not null check (content_source in ('bundled','generated','manual')),
  created_by_run_id uuid null references runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (device_id, subject_id)
);

create table subject_graphs (
  device_id uuid not null references devices(id) on delete cascade,
  subject_id text not null,
  graph_json jsonb not null,
  content_hash text not null,
  updated_by_run_id uuid not null references runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (device_id, subject_id),
  foreign key (device_id, subject_id) references subjects(device_id, subject_id) on delete cascade
);

create table topic_contents (
  device_id uuid not null references devices(id) on delete cascade,
  subject_id text not null,
  topic_id text not null,
  details_json jsonb not null,
  content_hash text not null,
  status text not null check (status in ('ready','generating','unavailable')),
  updated_by_run_id uuid not null references runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (device_id, subject_id, topic_id),
  foreign key (device_id, subject_id) references subjects(device_id, subject_id) on delete cascade
);

create table topic_cards (
  device_id uuid not null references devices(id) on delete cascade,
  subject_id text not null,
  topic_id text not null,
  card_id text not null,
  card_json jsonb not null,
  difficulty integer not null,
  source_artifact_kind text not null,
  created_by_run_id uuid not null references runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (device_id, subject_id, topic_id, card_id),
  foreign key (device_id, subject_id) references subjects(device_id, subject_id) on delete cascade
);

create table crystal_trial_sets (
  device_id uuid not null references devices(id) on delete cascade,
  subject_id text not null,
  topic_id text not null,
  target_level integer not null,
  card_pool_hash text not null,
  questions_json jsonb not null,
  content_hash text not null,
  created_by_run_id uuid not null references runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (device_id, subject_id, topic_id, target_level, card_pool_hash),
  foreign key (device_id, subject_id) references subjects(device_id, subject_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Indexes.
-- ---------------------------------------------------------------------------
create index idx_runs_device_status_created on runs(device_id, status, created_at desc);
create index idx_runs_device_kind_input_hash on runs(device_id, kind, input_hash);
create index idx_runs_device_idempotency_lookup
  on runs(device_id, idempotency_key)
  where idempotency_key is not null;
create unique index idx_runs_active_supersedes
  on runs(device_id, supersedes_key)
  where supersedes_key is not null
    and status not in ('failed_final', 'cancelled', 'applied_local', 'ready');
create index idx_jobs_run on jobs(run_id);
create index idx_events_run_seq on events(run_id, seq);
create index idx_stage_checkpoints_run on stage_checkpoints(run_id);
create index idx_idempotency_records_expires on idempotency_records(expires_at);
create index idx_subjects_device_updated on subjects(device_id, updated_at desc);
create index idx_topic_cards_scope on topic_cards(device_id, subject_id, topic_id);
create index idx_trial_sets_scope on crystal_trial_sets(device_id, subject_id, topic_id, target_level);

-- ---------------------------------------------------------------------------
-- Triggers and RPC functions.
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_subjects_updated_at
before update on subjects
for each row execute function set_updated_at();

create trigger trg_subject_graphs_updated_at
before update on subject_graphs
for each row execute function set_updated_at();

create trigger trg_topic_contents_updated_at
before update on topic_contents
for each row execute function set_updated_at();

create or replace function allocate_event_seq(p_run_id uuid) returns integer
language plpgsql as $$
declare v_next integer;
begin
  update runs set next_event_seq = next_event_seq + 1
  where id = p_run_id
  returning next_event_seq into v_next;

  return v_next;
end $$;

create or replace function reserve_run_budget(
  p_device_id uuid,
  p_day text,
  p_run_cap integer,
  p_token_cap bigint
) returns jsonb
language plpgsql as $$
declare
  v_row usage_counters;
  v_tokens bigint;
begin
  insert into usage_counters (device_id, day, runs_started, tokens_in, tokens_out)
  values (p_device_id, p_day, 0, 0, 0)
  on conflict (device_id, day) do nothing;

  select * into v_row
  from usage_counters
  where device_id = p_device_id and day = p_day
  for update;

  if v_row.runs_started >= p_run_cap then
    return jsonb_build_object(
      'ok', false,
      'code', 'budget:over-cap',
      'message', format('daily run cap (%s) exceeded', p_run_cap)
    );
  end if;

  v_tokens := coalesce(v_row.tokens_in, 0) + coalesce(v_row.tokens_out, 0);
  if v_tokens >= p_token_cap then
    return jsonb_build_object(
      'ok', false,
      'code', 'budget:over-cap',
      'message', format('daily token cap (%s) exceeded', p_token_cap)
    );
  end if;

  update usage_counters
  set runs_started = runs_started + 1
  where device_id = p_device_id and day = p_day;

  return jsonb_build_object('ok', true);
end $$;

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
  perform pg_advisory_xact_lock(hashtext(p_device_id::text || ':' || p_idempotency_key));

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

  delete from idempotency_records
  where device_id = p_device_id and key = p_idempotency_key;

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

  insert into idempotency_records (device_id, key, run_id, expires_at)
  values (p_device_id, p_idempotency_key, v_run_id, now() + interval '24 hours');

  return jsonb_build_object(
    'runId', v_run_id,
    'status', 'created',
    'existing', false
  );
end $$;

-- ---------------------------------------------------------------------------
-- Defense-in-depth: the browser never talks to Supabase tables directly.
-- Service-role Worker access bypasses RLS; anon/authenticated clients receive
-- no table policies until the future Supabase Auth migration.
-- ---------------------------------------------------------------------------
alter table devices enable row level security;
alter table runs enable row level security;
alter table jobs enable row level security;
alter table events enable row level security;
alter table artifacts enable row level security;
alter table usage_counters enable row level security;
alter table stage_checkpoints enable row level security;
alter table idempotency_records enable row level security;
alter table subjects enable row level security;
alter table subject_graphs enable row level security;
alter table topic_contents enable row level security;
alter table topic_cards enable row level security;
alter table crystal_trial_sets enable row level security;
