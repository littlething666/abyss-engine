/**
 * Device settings repository — server-side persistence for model bindings,
 * response-healing preference, and per-device generation flags.
 *
 * Phase 3: replaces the Phase 1 stub in settings.ts with actual Supabase
 * persistence.  Each key is a text identifier (e.g. 'model-bindings',
 * 'response-healing', 'durable-kinds'); the value is stored as jsonb.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DeviceSettingRow {
  device_id: string;
  key: string;
  value_json: Record<string, unknown>;
  updated_at: string;
}

export interface IDeviceSettingsRepo {
  /** Read all settings for a device. Returns an empty object if no rows exist. */
  getAll(deviceId: string): Promise<Record<string, unknown>>;
  /** Upsert a single key-value pair. */
  upsert(deviceId: string, key: string, value: Record<string, unknown>): Promise<void>;
  /** Upsert a batch of key-value pairs atomically (one row per key). */
  upsertMany(deviceId: string, entries: Array<{ key: string; value: Record<string, unknown> }>): Promise<void>;
}

export function createDeviceSettingsRepo(db: SupabaseClient): IDeviceSettingsRepo {
  return {
    async getAll(deviceId: string) {
      const { data, error } = await db
        .from('device_settings')
        .select('key, value_json')
        .eq('device_id', deviceId);

      if (error) throw error;

      const result: Record<string, unknown> = {};
      for (const row of (data ?? []) as Array<{ key: string; value_json: Record<string, unknown> }>) {
        result[row.key] = row.value_json;
      }
      return result;
    },

    async upsert(deviceId: string, key: string, value: Record<string, unknown>) {
      const { error } = await db
        .from('device_settings')
        .upsert({
          device_id: deviceId,
          key,
          value_json: value,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'device_id, key' });

      if (error) throw error;
    },

    async upsertMany(deviceId: string, entries: Array<{ key: string; value: Record<string, unknown> }>) {
      if (entries.length === 0) return;

      const rows = entries.map(({ key, value }) => ({
        device_id: deviceId,
        key,
        value_json: value,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await db
        .from('device_settings')
        .upsert(rows, { onConflict: 'device_id, key' });

      if (error) throw error;
    },
  };
}
