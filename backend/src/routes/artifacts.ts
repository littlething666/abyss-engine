/**
 * Artifact routes — GET /v1/artifacts/:id.
 *
 * Returns the artifact envelope or a signed Supabase Storage download URL.
 */

import { Hono } from 'hono';
import { makeRepos } from '../repositories';
import type { Env } from '../env';

const artifacts = new Hono<{ Bindings: Env; Variables: { deviceId: string } }>();

artifacts.get('/:id', async (c) => {
  const deviceId = c.get('deviceId');
  const artifactId = c.req.param('id');
  const repos = makeRepos(c.env);

  const row = await repos.artifacts.get(artifactId);

  if (!row || row.device_id !== deviceId) {
    return c.json({ error: 'not_found' }, 404);
  }

  // Return the storage-level JSON payload.
  const payload = await repos.artifacts.getStorage(row.storage_key);

  return c.json({
    id: row.id,
    kind: row.kind,
    inputHash: row.input_hash,
    contentHash: row.content_hash,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
    payload,
  });
});

export { artifacts };
