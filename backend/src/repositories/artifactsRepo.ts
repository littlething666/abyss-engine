/**
 * Artifacts repository — Supabase Storage + Postgres metadata.
 *
 * JSON artifact envelopes are stored in the `generation-artifacts` bucket
 * under `{deviceId}/{kind}/{input_hash}.json`. The `artifacts` table records
 * the storage key, content hash, and schema version for lookup and dedupe.
 *
 * Cache-hit short-circuit (Plan v3 Q7): before creating a Workflow, the
 * POST /v1/runs handler checks `findCacheHit(deviceId, kind, inputHash)`.
 * On hit, a synthetic run is created with `status = 'ready'` and synthetic
 * events referencing the cached artifact — no LLM call is made.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArtifactRow } from './types';

const BUCKET_NAME = 'generation-artifacts';

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
   * Store the JSON artifact in Supabase Storage and insert/update the
   * `artifacts` metadata row. Returns the artifact id.
   */
  putStorage(input: ArtifactStoragePayload, contentHash: string, schemaVersion: number, runId: string): Promise<string>;

  /**
   * Retrieve the stored JSON artifact from Supabase Storage.
   */
  getStorage(storageKey: string): Promise<unknown>;

  /**
   * Generate a signed download URL for the given storage key.
   * Used by GET /v1/artifacts/:id to return redirect-able URLs.
   */
  getSignedUrl(storageKey: string): Promise<string>;

  /** Read a single artifact row by id. */
  get(artifactId: string): Promise<ArtifactRow | null>;
}

export function createArtifactsRepo(db: SupabaseClient): IArtifactsRepo {
  function storageKey(deviceId: string, kind: string, inputHash: string): string {
    return `${deviceId}/${kind}/${inputHash}.json`;
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

      // 1. Upload to Supabase Storage.
      const { error: uploadError } = await db.storage
        .from(BUCKET_NAME)
        .upload(key, new Blob([body], { type: 'application/json' }), {
          contentType: 'application/json',
          upsert: true,
        });

      if (uploadError) throw uploadError;

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
      const { data, error } = await db.storage
        .from(BUCKET_NAME)
        .download(key);

      if (error) throw error;
      if (!data) throw new Error(`artifact not found: ${key}`);

      const text = await data.text();
      return JSON.parse(text);
    },

    async getSignedUrl(key: string) {
      const { data, error } = await db.storage
        .from(BUCKET_NAME)
        .createSignedUrl(key, 3600); // 1-hour expiry

      if (error) throw error;
      if (!data?.signedUrl) throw new Error(`failed to create signed URL for ${key}`);
      return data.signedUrl;
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
