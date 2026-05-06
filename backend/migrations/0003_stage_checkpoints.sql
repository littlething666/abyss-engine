-- 0003_stage_checkpoints.sql
--
-- Stage-level checkpoint persistence.
--
-- Required for Topic Content's three-stage resume (theory → study-cards →
-- mini-games). Topic Expansion and Subject Graph use a single stage each
-- for symmetry (expansion-cards / topics / edges).
--
-- Resume rule: if (run_id, stage) exists with artifact_id IS NOT NULL, the
-- stage is SKIPPED and the prior artifact_id is consumed for the next
-- stage's input.

create table if not exists stage_checkpoints (
  run_id       uuid not null references runs(id) on delete cascade,
  stage        text not null,
  status       text not null check (
                 status in (
                   'pending','generating','parsing','validating','persisting','ready','failed'
                 )
               ),
  artifact_id  uuid null references artifacts(id),
  job_id       uuid null references jobs(id),
  input_hash   text not null,
  attempt      integer not null default 0,
  started_at   timestamptz null,
  finished_at  timestamptz null,
  error_code   text null,
  error_message text null,

  primary key (run_id, stage)
);

create index idx_stage_checkpoints_run
  on stage_checkpoints(run_id);
