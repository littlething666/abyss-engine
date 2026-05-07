-- 0007_phase36_idempotency.sql
-- Phase 3.6 Step 5 — Idempotency TTL schema correction.
--
-- Replaces the unique partial index on runs(device_id, idempotency_key) with
-- a dedicated `idempotency_records` table that supports the documented 24h
-- dedupe window. The old unique index prevented fresh runs with the same key
-- after the 24h TTL expired because it enforced uniqueness at the DB level
-- indefinitely.
--
-- Design:
-- - idempotency_records owns the (device_id, key) uniqueness constraint.
-- - Each record has an expires_at (24h after creation).
-- - The middleware checks this table; inside TTL it returns the old run,
--   outside TTL it deletes the expired record and creates a fresh one.
--   The insert-then-delete-expired race is handled by the UNIQUE constraint:
--   two concurrent submits with an expired key will have one win the INSERT
--   and the other fail → the loser re-checks and returns the winner's runId.
-- - runs.idempotency_key stays as a non-unique column for audit/debugging.

-- ---------------------------------------------------------------------------
-- 1. Create idempotency_records table.
-- ---------------------------------------------------------------------------
create table idempotency_records (
  device_id uuid not null references devices(id) on delete cascade,
  key text not null,
  run_id uuid not null references runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (device_id, key)
);

create index idx_idempotency_records_expires
  on idempotency_records (expires_at)
  where expires_at < now();

-- ---------------------------------------------------------------------------
-- 2. Drop the old unique partial index on runs.
-- ---------------------------------------------------------------------------
drop index if exists idx_runs_device_idempotency;

-- ---------------------------------------------------------------------------
-- 3. Add a non-unique lookup index on runs(idempotency_key) for audit.
-- ---------------------------------------------------------------------------
create index idx_runs_device_idempotency_lookup
  on runs (device_id, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- 4. RPC: atomic idempotency check-and-insert.
--
-- Returns: { run_id: string | null, status: 'hit' | 'miss' | 'expired' }
--
-- On hit (key exists, not expired): returns the existing run_id.
-- On expired: deletes the expired record and returns status 'expired'.
-- On miss: inserts a new record and returns status 'miss'.
--
-- The caller inserts the run AFTER this RPC returns 'expired' or 'miss'.
-- The caller then calls record_idempotency_key to link the new run_id.
-- ---------------------------------------------------------------------------
create or replace function check_idempotency(
  p_device_id uuid,
  p_key text
) returns jsonb
language plpgsql as $$
declare
  v_record idempotency_records;
begin
  select * into v_record
  from idempotency_records
  where device_id = p_device_id and key = p_key;

  if found then
    if v_record.expires_at > now() then
      -- Hit: key is still valid.
      return jsonb_build_object(
        'run_id', v_record.run_id,
        'status', 'hit'
      );
    else
      -- Expired: delete the old record so a fresh one can be created.
      delete from idempotency_records
      where device_id = p_device_id and key = p_key;
      return jsonb_build_object('run_id', null, 'status', 'expired');
    end if;
  end if;

  -- Miss: no record exists.
  return jsonb_build_object('run_id', null, 'status', 'miss');
end $$;

-- ---------------------------------------------------------------------------
-- 5. RPC: record a new idempotency key after a run is created.
--
-- Inserts with a 24h TTL. The UNIQUE constraint on (device_id, key) means
-- concurrent attempts race; the loser should call check_idempotency again
-- and return the winner's runId.
-- ---------------------------------------------------------------------------
create or replace function record_idempotency_key(
  p_device_id uuid,
  p_key text,
  p_run_id uuid
) returns void
language plpgsql as $$
begin
  insert into idempotency_records (device_id, key, run_id, expires_at)
  values (p_device_id, p_key, p_run_id, now() + interval '24 hours')
  on conflict (device_id, key) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Periodic cleanup function (call from pg_cron or application-level job).
-- ---------------------------------------------------------------------------
create or replace function cleanup_expired_idempotency_records() returns integer
language plpgsql as $$
declare
  v_count integer;
begin
  delete from idempotency_records
  where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
