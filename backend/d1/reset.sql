-- Abyss Engine Cloudflare D1 destructive reset script.
-- Unreleased-app posture: data migration is intentionally unsupported.

pragma foreign_keys = off;

drop table if exists crystal_trial_sets;
drop table if exists topic_cards;
drop table if exists topic_contents;
drop table if exists subject_graphs;
drop table if exists subjects;
drop table if exists idempotency_records;
drop table if exists stage_checkpoints;
drop table if exists usage_counters;
drop table if exists artifacts;
drop table if exists events;
drop table if exists jobs;
drop table if exists runs;
drop table if exists devices;

pragma foreign_keys = on;
