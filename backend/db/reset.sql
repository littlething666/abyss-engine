-- Abyss Engine hosted Supabase reset script.
--
-- Destructive development reset for the unreleased app. Paste this whole file
-- into the hosted Supabase SQL editor, run it, then run backend/db/init.sql.
--
-- This drops only app-owned Postgres objects. Artifact blobs now live in
-- Cloudflare R2; clear the `abyss-generation-artifacts` bucket separately in
-- Cloudflare when you need a full blob reset.

begin;

drop table if exists crystal_trial_sets cascade;
drop table if exists topic_cards cascade;
drop table if exists topic_contents cascade;
drop table if exists subject_graphs cascade;
drop table if exists subjects cascade;
drop table if exists stage_checkpoints cascade;
drop table if exists idempotency_records cascade;
drop table if exists events cascade;
drop table if exists jobs cascade;
drop table if exists artifacts cascade;
drop table if exists usage_counters cascade;
drop table if exists runs cascade;
drop table if exists devices cascade;

drop function if exists atomic_submit_run(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  uuid,
  integer,
  bigint,
  timestamptz,
  timestamptz,
  text,
  text
) cascade;
drop function if exists record_tokens(uuid, text, bigint, bigint) cascade;
drop function if exists reserve_run_budget(uuid, text, integer, bigint) cascade;
drop function if exists allocate_event_seq(uuid) cascade;
drop function if exists set_updated_at() cascade;

-- Remove obsolete pre-squash functions if they exist on an older dev DB.
drop function if exists increment_runs_started(uuid, text) cascade;
drop function if exists check_idempotency(uuid, text) cascade;
drop function if exists record_idempotency_key(uuid, text, uuid) cascade;
drop function if exists cleanup_expired_idempotency_records() cascade;

commit;
