import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRunsRepo } from '../repositories/runsRepo';
import { scalar } from './runtimeAssertions';
import { buildAtomicSubmitInput, seedRuntimeDevice } from './runtimeFixtures';
import { resetRuntimeDb } from './setupRuntimeDb';

describe('runtime D1 atomicSubmitRun', () => {
  beforeEach(async () => {
    await resetRuntimeDb(env.GENERATION_DB);
    await seedRuntimeDevice(env.GENERATION_DB);
  });

  it('same Idempotency-Key concurrent submit returns one run', async () => {
    const repos = createRunsRepo(env.GENERATION_DB);
    const input = buildAtomicSubmitInput();

    const results = await Promise.all(Array.from({ length: 16 }, () => repos.atomicSubmitRun(input)));
    const runIds = new Set(results.map((result) => result.runId));

    expect(runIds.size).toBe(1);
    expect(await scalar(env.GENERATION_DB, 'select count(*) as value from runs')).toBe(1);
    expect(await scalar(env.GENERATION_DB, 'select count(*) as value from idempotency_records')).toBe(1);
    expect(
      await scalar(env.GENERATION_DB, 'select runs_started as value from usage_counters where device_id = ?', input.deviceId),
    ).toBe(1);
  });

  it('idempotency hit does not reserve budget twice', async () => {
    const repos = createRunsRepo(env.GENERATION_DB);
    const input = buildAtomicSubmitInput();

    const first = await repos.atomicSubmitRun(input);
    const second = await repos.atomicSubmitRun(input);

    expect(second).toMatchObject({ status: 'hit', existing: true, runId: first.runId });
    expect(await scalar(env.GENERATION_DB, 'select count(*) as value from runs')).toBe(1);
    expect(await scalar(env.GENERATION_DB, 'select count(*) as value from idempotency_records')).toBe(1);
    expect(
      await scalar(env.GENERATION_DB, 'select runs_started as value from usage_counters where device_id = ?', input.deviceId),
    ).toBe(1);
  });

  it('budget failure leaves no idempotency record', async () => {
    const repos = createRunsRepo(env.GENERATION_DB);
    const input = buildAtomicSubmitInput({ runCap: 0 });

    await expect(repos.atomicSubmitRun(input)).resolves.toMatchObject({ status: 'budget_exceeded' });

    expect(await scalar(env.GENERATION_DB, 'select count(*) as value from runs')).toBe(0);
    expect(await scalar(env.GENERATION_DB, 'select count(*) as value from idempotency_records')).toBe(0);
  });

  it('run creation failure rolls back idempotency reservation', async () => {
    const repos = createRunsRepo(env.GENERATION_DB);
    const input = buildAtomicSubmitInput({ parentRunId: 'missing-parent-run' });

    await expect(repos.atomicSubmitRun(input)).rejects.toThrow();

    expect(await scalar(env.GENERATION_DB, 'select count(*) as value from runs')).toBe(0);
    expect(await scalar(env.GENERATION_DB, 'select count(*) as value from idempotency_records')).toBe(0);
    expect(
      await scalar(env.GENERATION_DB, 'select coalesce(max(runs_started), 0) as value from usage_counters where device_id = ?', input.deviceId),
    ).toBe(0);
  });
});
