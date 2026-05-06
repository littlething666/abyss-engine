-- 0004_supersedes_key.sql
--
-- Server-side supersession for Topic Expansion.
--
-- The browser passes Supersedes-Key: te-supersedes:<topicRefKey> on
-- POST /v1/runs for kind = 'topic-expansion'.
--
-- When a new run is submitted with a supersedes_key that matches an
-- active run, the prior run is cancelled with cancel_reason = 'superseded'
-- BEFORE the new run is inserted (the handler runs this in a single
-- BEGIN ... COMMIT transaction).

alter table runs
  add column if not exists supersedes_key text null;

-- Partial unique index: at most one active run per (device_id, supersedes_key).
-- Terminal runs (failed_final, cancelled, applied_local) are excluded so a
-- superseded run no longer blocks the key.
create unique index if not exists idx_runs_active_supersedes
  on runs (device_id, supersedes_key)
  where supersedes_key is not null
    and status not in ('failed_final','cancelled','applied_local');
