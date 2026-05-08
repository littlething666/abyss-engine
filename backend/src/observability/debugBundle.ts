import type { Env } from '../env';
import type { Repos } from '../repositories';
import type { Logger } from './logger';
import { errorFields } from './logger';

export async function writeRunDebugBundle(input: {
  env: Env;
  repos: Repos;
  runId: string;
  deviceId: string;
  failure: { code: string; message: string };
  logger?: Logger;
  extra?: Record<string, unknown>;
}): Promise<string | null> {
  const bucket = input.env.GENERATION_ARTIFACTS_BUCKET;
  if (!bucket) return null;

  const key = `debug-runs/${input.runId}/bundle.json`;

  try {
    const run = await input.repos.runs.load(input.runId);
    const events = await input.repos.runs.eventsAfter(input.runId, input.deviceId, -1);
    const checkpoints = await input.repos.stageCheckpoints.byRun(input.runId);
    const jobs = await input.repos.runs.jobsByRun(input.runId);
    const artifactMetadata = await input.repos.artifacts.byRun(input.runId);

    await bucket.put(
      key,
      JSON.stringify({
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        run,
        events,
        checkpoints,
        jobs,
        artifactMetadata,
        failure: input.failure,
        extra: input.extra ?? {},
      }),
      { httpMetadata: { contentType: 'application/json' } },
    );

    input.logger?.info('debug_bundle.write.success', { runId: input.runId, storageKey: key });
    return key;
  } catch (err) {
    input.logger?.error('debug_bundle.write.failure', { runId: input.runId, storageKey: key, ...errorFields(err) });
    return null;
  }
}
