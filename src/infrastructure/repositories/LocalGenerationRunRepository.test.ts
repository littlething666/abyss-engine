import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '@/features/generationContracts';
import type { CrystalTrialRunInputSnapshot, TopicExpansionRunInputSnapshot, TopicTheoryRunInputSnapshot } from '@/features/generationContracts';
import type { RunInput } from '@/types/repository';
import {
  LocalGenerationRunRepository,
  type LocalRunnerDispatch,
  type LocalRunnerDispatchers,
  type LocalRunnerOutcome,
} from './LocalGenerationRunRepository';

/** Deferred-promise helper: returns a promise plus its resolve hook. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (err: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Drains a stream until the next terminal event (or `maxEvents`). */
async function collectUntilTerminal(
  stream: AsyncIterable<RunEvent>,
  maxEvents = 50,
): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  for await (const event of stream) {
    events.push(event);
    if (
      event.type === 'run.completed' ||
      event.type === 'run.failed' ||
      event.type === 'run.cancelled' ||
      events.length >= maxEvents
    ) {
      break;
    }
  }
  return events;
}

function noopDispatch(): LocalRunnerDispatch {
  return async () => ({
    status: 'success',
    artifacts: [],
  });
}

function successDispatch(
  artifacts: LocalRunnerOutcome extends infer O
    ? O extends { status: 'success'; artifacts: infer A }
      ? A
      : never
    : never,
): LocalRunnerDispatch {
  return async () => ({ status: 'success', artifacts });
}

function makeDispatchers(
  overrides: Partial<LocalRunnerDispatchers> = {},
): LocalRunnerDispatchers {
  return {
    topicContent: overrides.topicContent ?? noopDispatch(),
    topicExpansion: overrides.topicExpansion ?? noopDispatch(),
    subjectGraph: overrides.subjectGraph ?? noopDispatch(),
    crystalTrial: overrides.crystalTrial ?? noopDispatch(),
  };
}

const sampleTopicTheorySnapshot = {
  snapshot_version: 1,
  pipeline_kind: 'topic-theory',
  schema_version: 1,
  prompt_template_version: 1,
  model_id: 'qwen/qwen3-test',
  fixture: 'topic-theory',
} as unknown as TopicTheoryRunInputSnapshot;

const sampleExpansionSnapshot = {
  snapshot_version: 1,
  pipeline_kind: 'topic-expansion-cards',
  schema_version: 1,
  prompt_template_version: 1,
  model_id: 'qwen/qwen3-test',
  fixture: 'topic-expansion',
} as unknown as TopicExpansionRunInputSnapshot;

const sampleTrialSnapshot = {
  snapshot_version: 1,
  pipeline_kind: 'crystal-trial',
  schema_version: 1,
  prompt_template_version: 1,
  model_id: 'qwen/qwen3-test',
  fixture: 'crystal-trial',
} as unknown as CrystalTrialRunInputSnapshot;

function topicContentInput(suffix = ''): RunInput {
  return {
    pipelineKind: 'topic-content',
    snapshot: { ...(sampleTopicTheorySnapshot as object), fixture: `topic-theory${suffix}` } as TopicTheoryRunInputSnapshot,
    subjectId: `subject-${suffix || 'a'}`,
    topicId: `topic-${suffix || 'a'}`,
  };
}

function expansionInput(subjectId: string, topicId: string, marker = 'm'): RunInput {
  return {
    pipelineKind: 'topic-expansion',
    snapshot: { ...(sampleExpansionSnapshot as object), fixture: `topic-expansion-${marker}` } as TopicExpansionRunInputSnapshot,
    subjectId,
    topicId,
    nextLevel: 1,
  };
}

function crystalTrialInput(subjectId: string, topicId: string): RunInput {
  return {
    pipelineKind: 'crystal-trial',
    snapshot: sampleTrialSnapshot,
    subjectId,
    topicId,
    currentLevel: 0,
  };
}

describe('LocalGenerationRunRepository', () => {
  let nowMs = 1_700_000_000_000;
  const now = (): number => nowMs;

  beforeEach(() => {
    nowMs = 1_700_000_000_000;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submitRun returns a runId and records the run', async () => {
    const repo = new LocalGenerationRunRepository({
      deviceId: 'device-1',
      now,
      dispatchers: makeDispatchers(),
    });
    const { runId } = await repo.submitRun(topicContentInput(), 'idem-1');
    expect(runId).toMatch(/^[0-9a-f-]+$/);
    const snapshot = await repo.getRun(runId);
    expect(snapshot.runId).toBe(runId);
    expect(snapshot.deviceId).toBe('device-1');
    expect(snapshot.kind).toBe('topic-content');
    expect(snapshot.parentRunId).toBeUndefined();
    expect(snapshot.inputHash).toMatch(/^inp_[0-9a-f]{64}$/);
  });

  it('idempotency-key dedupes within the 24h window and returns a fresh runId after expiry', async () => {
    const repo = new LocalGenerationRunRepository({
      deviceId: 'device-1',
      now,
      dispatchers: makeDispatchers(),
    });
    const first = await repo.submitRun(topicContentInput('a'), 'idem-shared');
    nowMs += 60_000; // +1 min, within window
    const dedupe = await repo.submitRun(topicContentInput('a'), 'idem-shared');
    expect(dedupe.runId).toBe(first.runId);
    nowMs += 24 * 60 * 60 * 1000 + 1; // past TTL
    const fresh = await repo.submitRun(topicContentInput('a'), 'idem-shared');
    expect(fresh.runId).not.toBe(first.runId);
  });

  it('emits the success event sequence with artifact persistence', async () => {
    const repo = new LocalGenerationRunRepository({
      deviceId: 'device-1',
      now,
      dispatchers: makeDispatchers({
        topicContent: async ({ emitProgress }) => {
          emitProgress({ stage: 'theory', progress: 0.5 });
          return {
            status: 'success',
            artifacts: [
              {
                kind: 'topic-theory',
                contentHash: 'cnt_' + 'a'.repeat(64),
                schemaVersion: 1,
                payload: { hello: 'world' },
              },
            ],
          };
        },
      }),
    });
    const { runId } = await repo.submitRun(topicContentInput(), 'idem-success');
    const events = await collectUntilTerminal(repo.streamRunEvents(runId));
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'run.queued',
      'run.status',
      'run.status',
      'stage.progress',
      'artifact.ready',
      'run.status',
      'run.completed',
    ]);
    const artifactReady = events.find((e) => e.type === 'artifact.ready');
    expect(artifactReady).toBeDefined();
    if (artifactReady?.type !== 'artifact.ready') throw new Error('unreachable');
    expect(artifactReady.body.kind).toBe('topic-theory');
    expect(artifactReady.body.subjectId).toBe('subject-a');
    expect(artifactReady.body.topicId).toBe('topic-a');
    const envelope = await repo.getArtifact(artifactReady.body.artifactId);
    expect(envelope.kind).toBe('inline');
    if (envelope.kind !== 'inline') throw new Error('unreachable');
    expect(envelope.artifact.contentHash).toBe(artifactReady.body.contentHash);
    expect(envelope.artifact.payload).toEqual({ hello: 'world' });
    const finalSnapshot = await repo.getRun(runId);
    expect(finalSnapshot.status).toBe('applied-local');
    expect(finalSnapshot.finishedAt).toBeDefined();
  });

  it('emits a structured run.failed when the dispatcher returns failure', async () => {
    const repo = new LocalGenerationRunRepository({
      deviceId: 'device-1',
      now,
      dispatchers: makeDispatchers({
        topicContent: async () => ({
          status: 'failure',
          code: 'parse:zod-shape',
          message: 'shape mismatch',
        }),
      }),
    });
    const { runId } = await repo.submitRun(topicContentInput(), 'idem-fail');
    const events = await collectUntilTerminal(repo.streamRunEvents(runId));
    const failed = events.find((e) => e.type === 'run.failed');
    expect(failed).toBeDefined();
    if (failed?.type !== 'run.failed') throw new Error('unreachable');
    expect(failed.code).toBe('parse:zod-shape');
    expect(failed.message).toBe('shape mismatch');
    const snapshot = await repo.getRun(runId);
    expect(snapshot.status).toBe('failed-final');
    expect(snapshot.errorCode).toBe('parse:zod-shape');
  });

  it('cancelRun before the dispatcher starts yields terminal cancelled with no LLM call', async () => {
    const dispatchSpy = vi.fn(noopDispatch());
    const repo = new LocalGenerationRunRepository({
      deviceId: 'device-1',
      now,
      dispatchers: makeDispatchers({ topicContent: dispatchSpy }),
    });
    const { runId } = await repo.submitRun(topicContentInput(), 'idem-cancel-early');
    await repo.cancelRun(runId, 'user');
    const events = await collectUntilTerminal(repo.streamRunEvents(runId));
    const types = events.map((e) => e.type);
    expect(types).toContain('run.cancel-acknowledged');
    expect(types[types.length - 1]).toBe('run.cancelled');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('cancelRun mid-dispatch emits cancel-acknowledged immediately and terminal cancelled on settle', async () => {
    const gate = deferred<LocalRunnerOutcome>();
    const repo = new LocalGenerationRunRepository({
      deviceId: 'device-1',
      now,
      dispatchers: makeDispatchers({
        topicContent: async ({ signal }) => {
          signal.addEventListener('abort', () => {
            gate.resolve({ status: 'cancelled' });
          });
          return gate.promise;
        },
      }),
    });
    const { runId } = await repo.submitRun(topicContentInput(), 'idem-cancel-mid');
    // Yield the microtask queue so the dispatch async branch runs to its `await`.
    await Promise.resolve();
    await Promise.resolve();
    const cancelPromise = repo.cancelRun(runId, 'user');
    // The acknowledgement must land before the cancel awaits terminal.
    const ackSnapshot = await repo.getRun(runId);
    expect(ackSnapshot.status).not.toBe('cancelled'); // not terminal yet
    await cancelPromise;
    const events = await collectUntilTerminal(repo.streamRunEvents(runId));
    const ack = events.find((e) => e.type === 'run.cancel-acknowledged');
    expect(ack).toBeDefined();
    if (ack?.type !== 'run.cancel-acknowledged') throw new Error('unreachable');
    expect(ack.reason).toBe('user');
    const last = events[events.length - 1];
    expect(last.type).toBe('run.cancelled');
    if (last.type !== 'run.cancelled') throw new Error('unreachable');
    expect(last.reason).toBe('user');
  });

  it('retryRun preserves parentRunId lineage and dispatches afresh', async () => {
    const calls: string[] = [];
    const repo = new LocalGenerationRunRepository({
      deviceId: 'device-1',
      now,
      dispatchers: makeDispatchers({
        topicContent: async ({ runId }) => {
          calls.push(runId);
          return { status: 'success', artifacts: [] };
        },
      }),
    });
    const { runId: original } = await repo.submitRun(topicContentInput(), 'idem-original');
    await collectUntilTerminal(repo.streamRunEvents(original));
    const { runId: retry } = await repo.retryRun(original);
    await collectUntilTerminal(repo.streamRunEvents(retry));
    expect(retry).not.toBe(original);
    const retrySnapshot = await repo.getRun(retry);
    expect(retrySnapshot.parentRunId).toBe(original);
    expect(retrySnapshot.inputHash).toBe((await repo.getRun(original)).inputHash);
    expect(calls).toEqual([original, retry]);
  });

  it('topic-expansion supersession cancels the prior in-flight run with reason superseded', async () => {
    const firstGate = deferred<LocalRunnerOutcome>();
    let aborted = false;
    const repo = new LocalGenerationRunRepository({
      deviceId: 'device-1',
      now,
      dispatchers: makeDispatchers({
        topicExpansion: async ({ signal }) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            firstGate.resolve({ status: 'cancelled' });
          });
          return firstGate.promise;
        },
      }),
    });
    const first = await repo.submitRun(
      expansionInput('subject-x', 'topic-y', 'first'),
      'idem-exp-1',
    );
    await Promise.resolve();
    // Replace the topicExpansion dispatcher for the second submission so the new
    // run resolves immediately and we can observe the prior cancellation.
    (repo as unknown as { dispatchers: LocalRunnerDispatchers }).dispatchers.topicExpansion =
      successDispatch([]);
    const second = await repo.submitRun(
      expansionInput('subject-x', 'topic-y', 'second'),
      'idem-exp-2',
    );
    expect(second.runId).not.toBe(first.runId);
    expect(aborted).toBe(true);
    const firstEvents = await collectUntilTerminal(repo.streamRunEvents(first.runId));
    const lastFirst = firstEvents[firstEvents.length - 1];
    expect(lastFirst.type).toBe('run.cancelled');
    if (lastFirst.type !== 'run.cancelled') throw new Error('unreachable');
    expect(lastFirst.reason).toBe('superseded');
    const secondEvents = await collectUntilTerminal(repo.streamRunEvents(second.runId));
    expect(secondEvents[secondEvents.length - 1].type).toBe('run.completed');
  });

  it('streamRunEvents replays events with seq > lastSeq and yields live events until terminal', async () => {
    const gate = deferred<LocalRunnerOutcome>();
    const repo = new LocalGenerationRunRepository({
      deviceId: 'device-1',
      now,
      dispatchers: makeDispatchers({
        crystalTrial: async ({ emitProgress }) => {
          emitProgress({ stage: 'questions', progress: 0.25 });
          return gate.promise;
        },
      }),
    });
    const { runId } = await repo.submitRun(
      crystalTrialInput('subject-z', 'topic-z'),
      'idem-stream',
    );
    // Let the dispatcher run far enough to emit `stage.progress`.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const buffered = await repo.getRun(runId);
    expect(buffered.status).toBe('generating-stage');
    const liveEventsPromise = (async () => {
      const out: RunEvent[] = [];
      for await (const event of repo.streamRunEvents(runId, 2)) {
        out.push(event);
        if (event.type === 'run.completed') break;
      }
      return out;
    })();
    // Resolve the gate to send a success outcome.
    gate.resolve({ status: 'success', artifacts: [] });
    const events = await liveEventsPromise;
    // Replay starts at seq 3 (two events with seq <= 2 are skipped).
    expect(events.every((e) => e.seq > 2)).toBe(true);
    expect(events[events.length - 1].type).toBe('run.completed');
  });

  it('listRuns filters by status, kind, subjectId, and topicId', async () => {
    const gate = deferred<LocalRunnerOutcome>();
    const repo = new LocalGenerationRunRepository({
      deviceId: 'device-1',
      now,
      dispatchers: makeDispatchers({
        topicContent: async () => ({ status: 'success', artifacts: [] }),
        crystalTrial: async () => gate.promise,
      }),
    });
    const a = await repo.submitRun(topicContentInput('a'), 'idem-list-a');
    const b = await repo.submitRun(topicContentInput('b'), 'idem-list-b');
    const c = await repo.submitRun(
      crystalTrialInput('subject-x', 'topic-x'),
      'idem-list-c',
    );
    await collectUntilTerminal(repo.streamRunEvents(a.runId));
    await collectUntilTerminal(repo.streamRunEvents(b.runId));
    const recent = await repo.listRuns({ status: 'recent' });
    const recentIds = recent.map((r) => r.runId).sort();
    expect(recentIds).toEqual([a.runId, b.runId].sort());
    const active = await repo.listRuns({ status: 'active' });
    expect(active.map((r) => r.runId)).toEqual([c.runId]);
    const onlyTopicContent = await repo.listRuns({ kind: 'topic-content' });
    expect(onlyTopicContent.map((r) => r.runId).sort()).toEqual([a.runId, b.runId].sort());
    const subjectFiltered = await repo.listRuns({ subjectId: 'subject-a' });
    expect(subjectFiltered.map((r) => r.runId)).toEqual([a.runId]);
    const topicFiltered = await repo.listRuns({ topicId: 'topic-x' });
    expect(topicFiltered.map((r) => r.runId)).toEqual([c.runId]);
    gate.resolve({ status: 'success', artifacts: [] });
    await collectUntilTerminal(repo.streamRunEvents(c.runId));
  });

  it('getArtifact throws on an unknown artifactId', async () => {
    const repo = new LocalGenerationRunRepository({
      deviceId: 'device-1',
      now,
      dispatchers: makeDispatchers(),
    });
    await expect(repo.getArtifact('does-not-exist')).rejects.toThrow(/Unknown artifactId/);
  });
});
