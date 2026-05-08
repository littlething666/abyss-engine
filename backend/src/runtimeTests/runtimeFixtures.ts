import type { AtomicSubmitRunInput } from '../repositories/runsRepo';

export const RUNTIME_DEVICE_ID = 'runtime-device-0001';

export async function seedRuntimeDevice(db: D1Database, deviceId = RUNTIME_DEVICE_ID): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(
    'insert or ignore into devices (id, user_id, created_at, last_seen_at) values (?, null, ?, ?)',
  )
    .bind(deviceId, now, now)
    .run();
}

export function buildAtomicSubmitInput(
  overrides: Partial<AtomicSubmitRunInput> = {},
): AtomicSubmitRunInput {
  return {
    deviceId: RUNTIME_DEVICE_ID,
    idempotencyKey: 'idem-runtime-same-key',
    kind: 'crystal-trial',
    inputHash: 'ih_runtime_same_input',
    status: 'queued',
    supersedesKey: null,
    subjectId: 'subject-runtime',
    topicId: 'topic-runtime',
    snapshotJson: {
      intent: { kind: 'crystal-trial', subjectId: 'subject-runtime', topicId: 'topic-runtime', targetLevel: 1 },
      generationPolicy: { version: 1 },
    },
    parentRunId: null,
    runCap: 100,
    tokenCap: 1_000_000,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

export function buildRunCompletedEvent(): { type: 'run.completed'; payload: Record<string, unknown> } {
  return {
    type: 'run.completed',
    payload: { runId: 'runtime-run', artifactId: 'runtime-artifact' },
  };
}
