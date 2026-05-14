import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRunsRepo } from '../repositories/runsRepo';
import { scalar } from './runtimeAssertions';
import { buildAtomicSubmitInput, seedRuntimeDevice } from './runtimeFixtures';
import { resetRuntimeDb } from './setupRuntimeDb';

async function createRuntimeRun(): Promise<{ runId: string; deviceId: string; repos: ReturnType<typeof createRunsRepo> }> {
  const repos = createRunsRepo(env.GENERATION_DB);
  const input = buildAtomicSubmitInput({ idempotencyKey: crypto.randomUUID() });
  const result = await repos.atomicSubmitRun(input);
  if (!result.runId) throw new Error('runtime test failed to create run');
  return { runId: result.runId, deviceId: input.deviceId, repos };
}

describe('runtime D1 semantic event idempotency', () => {
  beforeEach(async () => {
    await resetRuntimeDb(env.GENERATION_DB);
    await seedRuntimeDevice(env.GENERATION_DB);
  });

  it('concurrent appendTypedOnce with same semantic key creates one event', async () => {
    const { repos, runId, deviceId } = await createRuntimeRun();

    const events = await Promise.all(
      Array.from({ length: 20 }, () =>
        repos.appendTypedOnce(runId, deviceId, 'terminal:completed', {
          type: 'run.completed',
          payload: {},
        }),
      ),
    );

    expect(new Set(events.map((event) => event.seq)).size).toBe(1);
    expect(
      await scalar(
        env.GENERATION_DB,
        "select count(*) as value from events where run_id = ? and semantic_key = 'terminal:completed'",
        runId,
      ),
    ).toBe(1);
  });

  it('distinct semantic keys remain ordered and eventsAfter replays only newer rows', async () => {
    const { repos, runId, deviceId } = await createRuntimeRun();

    await repos.appendTypedOnce(runId, deviceId, 'status:planning', {
      type: 'run.status',
      payload: { status: 'planning' },
    });
    await repos.appendTypedOnce(runId, deviceId, 'stage:theory:generating', {
      type: 'stage.progress',
      payload: { stage: 'theory', message: 'generating' },
    });
    await repos.appendTypedOnce(runId, deviceId, 'artifact:theory', {
      type: 'artifact.ready',
      payload: {
        artifactId: 'artifact-theory',
        kind: 'topic-theory',
        contentHash: 'ch_theory',
        inputHash: 'ih_theory',
        schemaVersion: 1,
      },
    });
    await repos.appendTypedOnce(runId, deviceId, 'terminal:completed', {
      type: 'run.completed',
      payload: {},
    });

    const all = await repos.eventsAfter(runId, deviceId, 0);
    expect(all.map((event) => event.seq)).toEqual([1, 2, 3, 4]);
    expect(new Set(all.map((event) => event.seq)).size).toBe(4);

    const afterTwo = await repos.eventsAfter(runId, deviceId, 2);
    expect(afterTwo.map((event) => event.seq)).toEqual([3, 4]);
  });

  it('runtime conflict path returns the replayed row', async () => {
    const { repos, runId, deviceId } = await createRuntimeRun();

    const [first, ...rest] = await Promise.all(
      Array.from({ length: 12 }, () =>
        repos.appendTypedOnce(runId, deviceId, 'terminal:completed', {
          type: 'run.completed',
          payload: {},
        }),
      ),
    );

    for (const event of rest) {
      expect(event.id).toBe(first.id);
      expect(event.seq).toBe(first.seq);
    }
    expect(await scalar(env.GENERATION_DB, 'select count(*) as value from events where run_id = ?', runId)).toBe(1);
  });
});
