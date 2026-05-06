-- 0006_phase35_corrective.sql
-- Phase 3.5 — Atomic budget reservation + supersession fix.
--
-- Step 5: Atomic budget reservation RPC — checks and reserves budget in a
-- single transaction so concurrent submissions cannot exceed run or token
-- caps.
--
-- Step 6A: Fix the partial unique index on supersedes_key to exclude
-- `ready` runs. A successfully completed (`ready`) Topic Expansion must
-- not block a later expansion with the same Supersedes-Key.

-- ---------------------------------------------------------------------------
-- 5. reserve_run_budget — atomic, concurrency-safe budget reservation.
--
-- On success: increments `runs_started` and returns `{ ok: true }`.
-- On over-cap: returns `{ ok: false, code: 'budget:over-cap', message }`.
--
-- The caller must pass the per-kind cap values; this RPC is pipeline-agnostic.
-- ---------------------------------------------------------------------------
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
  -- Read or create the row, locking it for the transaction.
  insert into usage_counters (device_id, day, runs_started, tokens_in, tokens_out)
  values (p_device_id, p_day, 0, 0, 0)
  on conflict (device_id, day) do nothing;

  select * into v_row
  from usage_counters
  where device_id = p_device_id and day = p_day
  for update;

  -- Check run cap.
  if v_row.runs_started >= p_run_cap then
    return jsonb_build_object(
      'ok', false,
      'code', 'budget:over-cap',
      'message', format('daily run cap (%s) exceeded', p_run_cap)
    );
  end if;

  -- Check token cap (estimated — actual usage recorded after LLM call).
  v_tokens := coalesce(v_row.tokens_in, 0) + coalesce(v_row.tokens_out, 0);
  if v_tokens >= p_token_cap then
    return jsonb_build_object(
      'ok', false,
      'code', 'budget:over-cap',
      'message', format('daily token estimate cap (%s) exceeded', p_token_cap)
    );
  end if;

  -- Reserve: increment runs_started.
  update usage_counters
  set runs_started = runs_started + 1
  where device_id = p_device_id and day = p_day;

  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 6A. Fix supersedes partial unique index — exclude `ready` from active runs.
--
-- A Topic Expansion run that reaches `ready` is server-terminal. It must not
-- block a later superseding expansion with the same Supersedes-Key.
-- ---------------------------------------------------------------------------
drop index if exists idx_runs_active_supersedes;

create unique index idx_runs_active_supersedes
  on runs (device_id, supersedes_key)
  where supersedes_key is not null
    and status not in ('failed_final', 'cancelled', 'applied_local', 'ready');
