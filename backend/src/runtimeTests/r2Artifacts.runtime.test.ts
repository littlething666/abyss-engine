import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createArtifactsRepo } from '../repositories/artifactsRepo';
import { createRunsRepo } from '../repositories/runsRepo';
import { scalar } from './runtimeAssertions';
import { buildAtomicSubmitInput, seedRuntimeDevice } from './runtimeFixtures';
import { resetRuntimeDb } from './setupRuntimeDb';

async function createRuntimeRun(inputHash: string): Promise<string> {
  const result = await createRunsRepo(env.GENERATION_DB).atomicSubmitRun(
    buildAtomicSubmitInput({ idempotencyKey: `idem-${inputHash}`, inputHash }),
  );
  if (!result.runId) throw new Error('runtime artifact test failed to create run');
  return result.runId;
}

describe('runtime R2 artifact storage', () => {
  beforeEach(async () => {
    await resetRuntimeDb(env.GENERATION_DB);
    await seedRuntimeDevice(env.GENERATION_DB);
  });

  it('writes artifact JSON to R2 and metadata to D1, then reads the same JSON back', async () => {
    const inputHash = `ih_artifact_${crypto.randomUUID()}`;
    const runId = await createRuntimeRun(inputHash);
    const artifacts = createArtifactsRepo(env.GENERATION_DB, env.GENERATION_ARTIFACTS_BUCKET);
    const payload = { questions: [{ id: 'q1', prompt: 'Runtime?', answers: ['yes'] }] };

    const artifactId = await artifacts.putStorage({
      deviceId: buildAtomicSubmitInput().deviceId,
      kind: 'crystal-trial',
      inputHash,
      payload,
    }, 'content-hash-runtime', 1, runId);

    const row = await artifacts.get(artifactId);
    expect(row).toMatchObject({
      id: artifactId,
      created_by_run_id: runId,
      kind: 'crystal-trial',
      input_hash: inputHash,
      content_hash: 'content-hash-runtime',
      schema_version: 1,
    });
    expect(row?.storage_key).toBe(`abyss/${buildAtomicSubmitInput().deviceId}/crystal-trial/1/${inputHash}.json`);
    await expect(artifacts.getStorage(row!.storage_key)).resolves.toEqual(payload);
  });

  it('concurrent writes for one cache key keep one D1 artifact row and one readable R2 object', async () => {
    const inputHash = `ih_artifact_concurrent_${crypto.randomUUID()}`;
    const runId = await createRuntimeRun(inputHash);
    const artifacts = createArtifactsRepo(env.GENERATION_DB, env.GENERATION_ARTIFACTS_BUCKET);
    const payload = { questions: [{ id: 'q1', prompt: 'Runtime concurrent?', answers: ['one'] }] };

    await Promise.all(Array.from({ length: 12 }, () => artifacts.putStorage({
      deviceId: buildAtomicSubmitInput().deviceId,
      kind: 'crystal-trial',
      inputHash,
      payload,
    }, 'content-hash-runtime-concurrent', 1, runId)));

    expect(await scalar(
      env.GENERATION_DB,
      'select count(*) as value from artifacts where device_id = ? and kind = ? and input_hash = ?',
      buildAtomicSubmitInput().deviceId,
      'crystal-trial',
      inputHash,
    )).toBe(1);

    const hit = await artifacts.findCacheHit(buildAtomicSubmitInput().deviceId, 'crystal-trial', inputHash);
    expect(hit).not.toBeNull();
    await expect(artifacts.getStorage(hit!.storage_key)).resolves.toEqual(payload);
  });
});
