/**
 * Device repository — upserts device fingerprints on every API call.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeviceRow } from './types';

export interface IDevicesRepo {
  /** Upsert a device row by id. Sets `last_seen_at` to now() on conflict. */
  upsert(deviceId: string): Promise<DeviceRow>;
  /** Read a single device by id. Returns null if unknown. */
  get(deviceId: string): Promise<DeviceRow | null>;
}

export function createDevicesRepo(db: SupabaseClient): IDevicesRepo {
  return {
    async upsert(deviceId: string) {
      const { data, error } = await db
        .from('devices')
        .upsert({ id: deviceId, last_seen_at: new Date().toISOString() })
        .select('*')
        .single();

      if (error) throw error;
      return data as DeviceRow;
    },

    async get(deviceId: string) {
      const { data, error } = await db
        .from('devices')
        .select('*')
        .eq('id', deviceId)
        .maybeSingle();

      if (error) throw error;
      return (data as DeviceRow) ?? null;
    },
  };
}
