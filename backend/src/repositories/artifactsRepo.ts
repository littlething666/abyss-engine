/**
 * Artifacts repository — Cloudflare R2 blob storage + Postgres metadata.
 *
 * JSON artifact envelopes are stored in the `GENERATION_ARTIFACTS_BUCKET`
 * R2 bucket under `{deviceId}/{kind}/{input_hash}.json`. The `artifacts`
 * table records the object key, content hash, and schema version for lookup
 * and dedupe.
 *
 * Cache-hit short-circuit (Plan v3 Q7): before creating a Workflow, the
 * POST /v1/runs handler checks `findCacheHit(deviceId, kind, inputHash)`.
 * On hit, a synthetic run is created with `status = 'ready'` and synthetic
 * events referencing the cached artifact — no LLM call is made.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArtifactRow } from './types';

export interface ArtifactObjectStore {
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{ text(): Promise<string> } | null>;
}

/**
 * Payload shape expected by `putStorage`. The caller builds this from the
 * parsed-and-validated artifact.
 */
export interface ArtifactStoragePayload {
  deviceId: string;
  kind: string;
  inputHash: string;
  /** Raw JSON payload (will be serialized before storage). */
  payload: unknown;
}

export interface IArtifactsRepo {
  /**
   * Check for a cached artifact matching (device_id, kind, input_hash).
   * Returns the artifact row on hit, null on miss.
   */
  findCacheHit(deviceId: string, kind: string, inputHash: string): Promise<ArtifactRow | null>;

  /**
   * Store the JSON artifact in R2 and insert/update the
   * `artifacts` metadata row. Returns the artifact id.
   */
  putStorage(input: ArtifactStoragePayload, contentHash: string, schemaVersion: number, runId: string): Promise<string>;

  /**
   * Retrieve the stored JSON artifact from R2.
   */
  getStorage(storageKey: string): Promise<unknown>;

  /** Read a single artifact row by id. */
  get(artifactId: string): Promise<ArtifactRow | null>;
}

export function createArtifactsRepo(db: SupabaseClient, objectStore?: ArtifactObjectStore): IArtifactsRepo {
  function storageKey(deviceId: string, kind: string, inputHash: string): string {
    return `${deviceId}/${kind}/${inputHash}.json`;
  }

  function requireObjectStore(): ArtifactObjectStore {
    if (!objectStore) {
      throw new Error('GENERATION_ARTIFACTS_BUCKET binding is required for artifact storage');
    }
    return objectStore;
  }

  return {
    async findCacheHit(deviceId: string, kind: string, inputHash: string) {
      const { data, error } = await db
        .from('artifacts')
        .select('*')
        .eq('device_id', deviceId)
        .eq('kind', kind)
        .eq('input_hash', inputHash)
        .maybeSingle();

      if (error) throw error;
      return (data as ArtifactRow) ?? null;
    },

    async putStorage(input: ArtifactStoragePayload, contentHash: string, schemaVersion: number, runId: string) {
      const key = storageKey(input.deviceId, input.kind, input.inputHash);
      const body = JSON.stringify(input.payload);

      // 1. Upload to R2. `put` replaces an existing object at the same key,
      // matching the metadata table's upsert semantics.
      await requireObjectStore().put(key, body, {
        httpMetadata: { contentType: 'application/json' },
      });

      // 2. Upsert the artifacts metadata row.
      const { data, error } = await db
        .from('artifacts')
        .upsert({
          device_id: input.deviceId,
          created_by_run_id: runId,
          kind: input.kind,
          input_hash: input.inputHash,
          storage_key: key,
          content_hash: contentHash,
          schema_version: schemaVersion,
        })
        .select('id')
        .single();

      if (error) throw error;
      return (data as { id: string }).id;
    },

    async getStorage(key: string) {
      const object = await requireObjectStore().get(key);
      if (!object) throw new Error(`artifact not found: ${key}`);

      return JSON.parse(await object.text());
    },

    async get(artifactId: string) {
      const { data, error } = await db
        .from('artifacts')
        .select('*')
        .eq('id', artifactId)
        .maybeSingle();

      if (error) throw error;
      return (data as ArtifactRow) ?? null;
    },
  };
}
