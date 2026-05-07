-- 0009_learning_content_store.sql
-- Phase 4 PR-C — backend-authoritative Learning Content Store.
-- Destructive reset posture: these read-model tables are backend-owned and do
-- not migrate browser IndexedDB generated content.

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- subjects — per-device library manifest entries.
-- ---------------------------------------------------------------------------
create table if not exists subjects (
  device_id uuid not null references devices(id) on delete cascade,
  subject_id text not null,
  title text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  content_source text not null check (content_source in ('bundled','generated','manual')),
  created_by_run_id uuid null references runs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (device_id, subject_id)
);

drop trigger if exists trg_subjects_updated_at on subjects;
create trigger trg_subjects_updated_at
before update on subjects
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- subject_graphs — application read model for a Subject Graph.
-- ---------------------------------------------------------------------------
create table if not exists subject_graphs (
  device_id uuid not null references devices(id) on delete cascade,
  subject_id text not null,
  graph_json jsonb not null,
  content_hash text not null,
  updated_by_run_id uuid not null references runs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (device_id, subject_id),
  foreign key (device_id, subject_id) references subjects(device_id, subject_id) on delete cascade
);

drop trigger if exists trg_subject_graphs_updated_at on subject_graphs;
create trigger trg_subject_graphs_updated_at
before update on subject_graphs
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- topic_contents — theory/details read model.
-- ---------------------------------------------------------------------------
create table if not exists topic_contents (
  device_id uuid not null references devices(id) on delete cascade,
  subject_id text not null,
  topic_id text not null,
  details_json jsonb not null,
  content_hash text not null,
  status text not null check (status in ('ready','generating','unavailable')),
  updated_by_run_id uuid not null references runs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (device_id, subject_id, topic_id),
  foreign key (device_id, subject_id) references subjects(device_id, subject_id) on delete cascade
);

drop trigger if exists trg_topic_contents_updated_at on topic_contents;
create trigger trg_topic_contents_updated_at
before update on topic_contents
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- topic_cards — generated study cards and mini-game cards.
-- ---------------------------------------------------------------------------
create table if not exists topic_cards (
  device_id uuid not null references devices(id) on delete cascade,
  subject_id text not null,
  topic_id text not null,
  card_id text not null,
  card_json jsonb not null,
  difficulty integer not null,
  source_artifact_kind text not null,
  created_by_run_id uuid not null references runs(id),
  created_at timestamptz not null default now(),
  primary key (device_id, subject_id, topic_id, card_id),
  foreign key (device_id, subject_id) references subjects(device_id, subject_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- crystal_trial_sets — generated question sets keyed by card-pool hash.
-- ---------------------------------------------------------------------------
create table if not exists crystal_trial_sets (
  device_id uuid not null references devices(id) on delete cascade,
  subject_id text not null,
  topic_id text not null,
  target_level integer not null,
  card_pool_hash text not null,
  questions_json jsonb not null,
  content_hash text not null,
  created_by_run_id uuid not null references runs(id),
  created_at timestamptz not null default now(),
  primary key (device_id, subject_id, topic_id, target_level, card_pool_hash),
  foreign key (device_id, subject_id) references subjects(device_id, subject_id) on delete cascade
);

create index if not exists idx_subjects_device_updated on subjects(device_id, updated_at desc);
create index if not exists idx_topic_cards_scope on topic_cards(device_id, subject_id, topic_id);
create index if not exists idx_trial_sets_scope on crystal_trial_sets(device_id, subject_id, topic_id, target_level);
