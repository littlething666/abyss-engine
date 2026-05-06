-- Device settings — server-side persistence for model bindings,
-- response-healing preference, and per-device generation flags.
--
-- Phase 3: settings endpoint persists model bindings and OpenRouter
-- response-healing preference server-side per device (Plan v3 §Observability + full budgets).
--
-- Each row stores a single key-value pair scoped by device_id.
-- The client PUT /v1/settings sends the full settings bag; the server
-- upserts one row per key per device.

create table if not exists device_settings (
  device_id  uuid not null references devices(id),
  key        text not null,
  value_json jsonb not null,
  updated_at timestamptz not null default now(),

  primary key (device_id, key)
);

create index idx_device_settings_device on device_settings(device_id);
