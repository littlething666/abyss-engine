/**
 * Device repository — upserts device identifiers on every API call.
 */

import type { DeviceRow } from './types';
import { nowIso } from './d1';

export interface IDevicesRepo {
  /** Upsert a device row by id. Sets `last_seen_at` to now on conflict. */
  upsert(deviceId: string): Promise<DeviceRow>;
  /** Read a single device by id. Returns null if unknown. */
  get(deviceId: string): Promise<DeviceRow | null>;
}

export function createDevicesRepo(db: D1Database): IDevicesRepo {
  return {
    async upsert(deviceId: string) {
      const now = nowIso();
      const row = await db.prepare(`
        insert into devices (id, created_at, last_seen_at)
        values (?, ?, ?)
        on conflict(id) do update set last_seen_at = excluded.last_seen_at
        returning *
      `).bind(deviceId, now, now).first<DeviceRow>();

      if (!row) throw new Error('D1 devices.upsert: failed to return device row');
      return row;
    },

    async get(deviceId: string) {
      return await db.prepare('select * from devices where id = ?').bind(deviceId).first<DeviceRow>();
    },
  };
}
