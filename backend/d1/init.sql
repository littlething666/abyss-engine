-- Abyss Engine Cloudflare D1 canonical init script.
--
-- Unreleased-app posture: this is the single canonical D1 database init path.
-- Do not add numbered migrations before release. Reset local D1 with
-- backend/d1/reset.sql, then apply this file.
--
-- D1 stores queryable metadata and Learning Content Store rows. JSON columns
-- are TEXT and are parsed/stringified only in backend repository adapters.
-- R2 stores artifact bodies, checkpoints, raw model outputs, eval snapshots,
-- and replay/debug bundles.

pragma foreign_keys = on;

create table if not exists devices (
  id text primary key,
  user_id text null,
  created_at text not null,
  last_seen_at text not null
);

create table if not exists runs (
  id text primary key,
  device_id text not null references devices(id) on delete cascade,
  kind text not null check (kind in ('topic-content', 'topic-expansion', 'subject-graph', 'crystal-trial')),
  status text not null check (status in ('queued','planning','generating_stage','parsing','validating','persisting','ready','applied_local','failed_final','cancelled')),
  input_hash text not null,
  idempotency_key text null,
  parent_run_id text null references runs(id) on delete set null,
  supersedes_key text null,
  cancel_requested_at text null,
  cancel_reason text null check (cancel_reason in ('user','superseded') or cancel_reason is null),
  subject_id text null,
  topic_id text null,
  created_at text not null,
  started_at text null,
  finished_at text null,
  error_code text null,
  error_message text null,
  snapshot_json text not null,
  next_event_seq integer not null default 0
);

create table if not exists jobs (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  kind text not null,
  stage text not null,
  status text not null,
  retry_of text null references jobs(id) on delete set null,
  input_hash text not null,
  model text not null,
  metadata_json text null,
  started_at text null,
  finished_at text null,
  error_code text null,
  error_message text null
);

create table if not exists events (
  id integer primary key autoincrement,
  run_id text not null references runs(id) on delete cascade,
  device_id text not null references devices(id) on delete cascade,
  seq integer not null,
  ts text not null,
  type text not null,
  payload_json text not null,
  semantic_key text null,
  unique (run_id, seq),
  unique (run_id, semantic_key)
);

create table if not exists artifacts (
  id text primary key,
  device_id text not null references devices(id) on delete cascade,
  created_by_run_id text not null references runs(id) on delete cascade,
  kind text not null,
  input_hash text not null,
  storage_key text not null,
  content_hash text not null,
  schema_version integer not null,
  created_at text not null,
  retention_tier text not null default 'active' check (retention_tier in ('active','archived','deleted')),
  retention_updated_at text not null,
  unique (device_id, kind, input_hash)
);

create table if not exists usage_counters (
  device_id text not null references devices(id) on delete cascade,
  day text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  runs_started integer not null default 0,
  primary key (device_id, day)
);

create table if not exists stage_checkpoints (
  run_id text not null references runs(id) on delete cascade,
  stage text not null,
  status text not null check (status in ('pending','generating','parsing','validating','persisting','ready','failed')),
  artifact_id text null references artifacts(id) on delete set null,
  job_id text null references jobs(id) on delete set null,
  input_hash text not null,
  attempt integer not null default 0,
  started_at text null,
  finished_at text null,
  error_code text null,
  error_message text null,
  primary key (run_id, stage)
);

create table if not exists idempotency_records (
  device_id text not null references devices(id) on delete cascade,
  key text not null,
  run_id text not null,
  created_at text not null,
  expires_at text not null,
  primary key (device_id, key)
);

create table if not exists subjects (
  device_id text not null references devices(id) on delete cascade,
  subject_id text not null,
  title text not null,
  metadata_json text not null default '{}',
  content_source text not null check (content_source in ('bundled','generated','manual')),
  created_by_run_id text null references runs(id) on delete set null,
  created_at text not null,
  updated_at text not null,
  primary key (device_id, subject_id)
);

create table if not exists subject_graphs (
  device_id text not null references devices(id) on delete cascade,
  subject_id text not null,
  graph_json text not null,
  content_hash text not null,
  updated_by_run_id text not null references runs(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  primary key (device_id, subject_id),
  foreign key (device_id, subject_id) references subjects(device_id, subject_id) on delete cascade
);

create table if not exists topic_contents (
  device_id text not null references devices(id) on delete cascade,
  subject_id text not null,
  topic_id text not null,
  details_json text not null,
  content_hash text not null,
  status text not null check (status in ('ready','generating','unavailable')),
  updated_by_run_id text not null references runs(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  primary key (device_id, subject_id, topic_id),
  foreign key (device_id, subject_id) references subjects(device_id, subject_id) on delete cascade
);

create table if not exists topic_cards (
  device_id text not null references devices(id) on delete cascade,
  subject_id text not null,
  topic_id text not null,
  card_id text not null,
  card_json text not null,
  difficulty integer not null,
  source_artifact_kind text not null,
  created_by_run_id text not null references runs(id) on delete cascade,
  created_at text not null,
  primary key (device_id, subject_id, topic_id, card_id),
  foreign key (device_id, subject_id) references subjects(device_id, subject_id) on delete cascade
);

create table if not exists crystal_trial_sets (
  device_id text not null references devices(id) on delete cascade,
  subject_id text not null,
  topic_id text not null,
  target_level integer not null,
  card_pool_hash text not null,
  questions_json text not null,
  content_hash text not null,
  created_by_run_id text not null references runs(id) on delete cascade,
  created_at text not null,
  primary key (device_id, subject_id, topic_id, target_level, card_pool_hash),
  foreign key (device_id, subject_id) references subjects(device_id, subject_id) on delete cascade
);

create index if not exists idx_runs_device_status_created on runs(device_id, status, created_at desc);
create index if not exists idx_runs_device_kind_input_hash on runs(device_id, kind, input_hash);
create index if not exists idx_runs_device_idempotency_lookup on runs(device_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists idx_runs_active_supersedes on runs(device_id, supersedes_key)
  where supersedes_key is not null and status not in ('failed_final', 'cancelled', 'applied_local', 'ready');
create index if not exists idx_jobs_run on jobs(run_id);
create index if not exists idx_events_run_seq on events(run_id, seq);
create index if not exists idx_stage_checkpoints_run on stage_checkpoints(run_id);
create index if not exists idx_idempotency_records_expires on idempotency_records(expires_at);
create index if not exists idx_subjects_device_updated on subjects(device_id, updated_at desc);
create index if not exists idx_topic_cards_scope on topic_cards(device_id, subject_id, topic_id);
create index if not exists idx_trial_sets_scope on crystal_trial_sets(device_id, subject_id, topic_id, target_level);
