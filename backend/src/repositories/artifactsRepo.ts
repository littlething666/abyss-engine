/**
 * Artifacts repository — Cloudflare R2 blob storage + D1 metadata.
 *
 * R2 stores artifact JSON envelopes. D1 stores only metadata/cache index rows;
 * it is never used for artifact bodies.
 */

import type { ArtifactRow } from './types';
import { nowIso, parseJsonValue } from './d1';

export interface ArtifactObjectStore {
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{ text(): Promise<string> } | null>;
}

/** Payload shape expected by `putStorage`. */
export interface ArtifactStoragePayload {
  deviceId: string;
  kind: string;
  inputHash: string;
  /** Raw JSON payload (will be serialized before storage). */
  payload: unknown;
}

export interface IArtifactsRepo {
  findCacheHit(deviceId: string, kind: string, inputHash: string): Promise<ArtifactRow | null>;
  putStorage(input: ArtifactStoragePayload, contentHash: string, schemaVersion: number, runId: string): Promise<string>;
  getStorage(storageKey: string): Promise<unknown>;
  get(artifactId: string): Promise<ArtifactRow | null>;
}

export function createArtifactsRepo(db: D1Database, objectStore?: ArtifactObjectStore): IArtifactsRepo {
  function storageKey(deviceId: string, kind: string, schemaVersion: number, inputHash: string): string {
    return `abyss/${deviceId}/${kind}/${schemaVersion}/${inputHash}.json`;
  }

  function requireObjectStore(): ArtifactObjectStore {
    if (!objectStore) {
      throw new Error('GENERATION_ARTIFACTS_BUCKET binding is required for artifact storage');
    }
    return objectStore;
  }

  return {
    async findCacheHit(deviceId, kind, inputHash) {
      return await db.prepare(`
        select * from artifacts
        where device_id = ? and kind = ? and input_hash = ?
      `).bind(deviceId, kind, inputHash).first<ArtifactRow>();
    },

    async putStorage(input, contentHash, schemaVersion, runId) {
      const key = storageKey(input.deviceId, input.kind, schemaVersion, input.inputHash);
      const body = JSON.stringify(input.payload);
      await requireObjectStore().put(key, body, {
        httpMetadata: { contentType: 'application/json' },
      });

      const artifactId = crypto.randomUUID();
      const now = nowIso();
      const row = await db.prepare(`
        insert into artifacts (
          id, device_id, created_by_run_id, kind, input_hash, storage_key,
          content_hash, schema_version, created_at, retention_tier, retention_updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
        on conflict(device_id, kind, input_hash) do update set
          storage_key = excluded.storage_key,
          content_hash = excluded.content_hash,
          schema_version = excluded.schema_version,
          retention_tier = 'active',
          retention_updated_at = excluded.retention_updated_at
        returning id
      `).bind(
        artifactId,
        input.deviceId,
        runId,
        input.kind,
        input.inputHash,
        key,
        contentHash,
        schemaVersion,
        now,
        now,
      ).first<{ id: string }>();

      if (!row) throw new Error('D1 artifacts.putStorage: failed to return artifact id');
      return row.id;
    },

    async getStorage(key) {
      const object = await requireObjectStore().get(key);
      if (!object) throw new Error(`artifact not found in R2: ${key}`);
      return parseJsonValue(await object.text(), `R2 artifact ${key}`);
    },

    async get(artifactId) {
      return await db.prepare('select * from artifacts where id = ?').bind(artifactId).first<ArtifactRow>();
    },
  };
}
