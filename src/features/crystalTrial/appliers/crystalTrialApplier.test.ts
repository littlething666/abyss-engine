/**
 * Tests for `crystalTrialApplier` — Phase 0.5 step 5.
 */

import { beforeEach, describe, it, expect } from 'vitest';

import { createCrystalTrialApplier } from './crystalTrialApplier';
import { useCrystalTrialStore } from '../crystalTrialStore';
import type {
  ArtifactApplyContext,
  AppliedArtifactsStore,
} from '@/features/generationContracts/artifacts/applier';
import { appEventBus } from '@/infrastructure/eventBus';

function makeMockDedupeStore(): AppliedArtifactsStore & { records: Map<string, { kind: string; appliedAt: number }> } {
  const records = new Map<string, { kind: string; appliedAt: number }>();
  return {
    records,
    async has(contentHash) { return records.has(contentHash); },
    async record(contentHash, kind, appliedAt) { records.set(contentHash, { kind, appliedAt }); },
    async getLatestTopicExpansionScope() { return null; },
  };
}

function makeContext(overrides?: Partial<ArtifactApplyContext>): ArtifactApplyContext {
  return {
    runId: 'run-1',
    deviceId: 'device-1',
    now: () => 1000,
    dedupeStore: makeMockDedupeStore(),
    subjectId: 'sub-a',
    topicId: 'top-1',
    ...overrides,
  };
}

type TrialArtifactEnvelope = Parameters<ReturnType<typeof createCrystalTrialApplier>['apply']>[0];

function makeEnvelope(questions: Array<Record<string, unknown>>, contentHash = 'cnt_ct1'): TrialArtifactEnvelope {
  return {
    kind: 'inline',
    artifact: {
      id: 'art-1',
      kind: 'crystal-trial',
      contentHash,
      inputHash: 'inp_ct1',
      schemaVersion: 1,
      createdByRunId: 'run-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload: { questions },
    },
  } as unknown as TrialArtifactEnvelope;
}

function signedUrlEnvelope(): TrialArtifactEnvelope {
  return {
    kind: 'signed-url',
    meta: {
      id: 'art-1',
      kind: 'crystal-trial',
      contentHash: 'cnt_x',
      inputHash: 'inp_x',
      schemaVersion: 1,
      createdByRunId: 'run-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload: {},
    },
    url: 'https://example.com',
    expiresAt: '2026-01-02T00:00:00.000Z',
  } as unknown as TrialArtifactEnvelope;
}

function makeQuestion(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: overrides?.id ?? 'q-1',
    category: overrides?.category ?? 'interview',
    scenario: overrides?.scenario ?? 'A scenario',
    question: overrides?.question ?? 'A question?',
    options: overrides?.options ?? ['A', 'B', 'C', 'D'],
    correctAnswer: overrides?.correctAnswer ?? 'A',
    explanation: overrides?.explanation ?? 'Because',
    sourceCardSummaries: overrides?.sourceCardSummaries ?? ['Card 1', 'Card 2'],
  };
}

describe('crystalTrialApplier', () => {
  beforeEach(() => {
    useCrystalTrialStore.setState({
      trials: {},
      cooldownCardsReviewed: {},
      cooldownStartedAt: {},
    });
  });

  it('returns duplicate when contentHash already applied', async () => {
    const store = makeMockDedupeStore();
    await store.record('cnt_ct1', 'crystal-trial', 500);
    const applier = createCrystalTrialApplier();
    const result = await applier.apply(
      makeEnvelope([makeQuestion()], 'cnt_ct1'),
      makeContext({ dedupeStore: store }),
    );
    expect(result).toEqual({ applied: false, reason: 'duplicate' });
  });

  it('returns invalid for signed-url envelope', async () => {
    const applier = createCrystalTrialApplier();
    const result = await applier.apply(signedUrlEnvelope(), makeContext());
    expect(result).toEqual({ applied: false, reason: 'invalid' });
  });

  it('returns superseded when no pregen trial is in flight', async () => {
    const applier = createCrystalTrialApplier();
    const result = await applier.apply(
      makeEnvelope([makeQuestion()]),
      makeContext(),
    );
    expect(result).toEqual({ applied: false, reason: 'superseded' });
  });

  it('applies questions to store when pregen is in flight', async () => {
    useCrystalTrialStore.getState().startPregeneration({
      subjectId: 'sub-a',
      topicId: 'top-1',
      targetLevel: 2,
    });

    const applier = createCrystalTrialApplier();
    const result = await applier.apply(
      makeEnvelope([
        makeQuestion({ id: 'q-1', category: 'interview', question: 'Q1?' }),
        makeQuestion({ id: 'q-2', category: 'troubleshooting', question: 'Q2?' }),
      ]),
      makeContext(),
    );

    expect(result).toEqual({ applied: true });

    const trial = useCrystalTrialStore.getState().getCurrentTrial({ subjectId: 'sub-a', topicId: 'top-1' });
    expect(trial).not.toBeNull();
    expect(trial!.status).toBe('awaiting_player');
    expect(trial!.questions).toHaveLength(2);
    expect(trial!.questions[0].id).toBe('q-1');
  });

  it('sets card pool hash on store', async () => {
    useCrystalTrialStore.getState().startPregeneration({
      subjectId: 'sub-a',
      topicId: 'top-1',
      targetLevel: 1,
    });

    const applier = createCrystalTrialApplier();
    await applier.apply(
      makeEnvelope([makeQuestion()], 'cnt_hash_ct'),
      makeContext(),
    );

    const trial = useCrystalTrialStore.getState().getCurrentTrial({ subjectId: 'sub-a', topicId: 'top-1' });
    expect(trial!.cardPoolHash).toBe('inp_ct1');
  });

  it('returns invalid when subjectId is missing', async () => {
    const applier = createCrystalTrialApplier();
    const result = await applier.apply(
      makeEnvelope([makeQuestion()]),
      makeContext({ subjectId: undefined }),
    );
    expect(result).toEqual({ applied: false, reason: 'invalid' });
  });

  it('NEVER emits crystal-trial:completed', async () => {
    useCrystalTrialStore.getState().startPregeneration({
      subjectId: 'sub-a',
      topicId: 'top-1',
      targetLevel: 2,
    });

    let completedFired = false;
    const unsub = appEventBus.on('crystal-trial:completed', () => {
      completedFired = true;
    });

    const applier = createCrystalTrialApplier();
    await applier.apply(
      makeEnvelope([makeQuestion()]),
      makeContext(),
    );

    expect(completedFired).toBe(false);
    unsub();
  });

  it('returns invalid when questions array is empty', async () => {
    useCrystalTrialStore.getState().startPregeneration({
      subjectId: 'sub-a',
      topicId: 'top-1',
      targetLevel: 2,
    });

    const applier = createCrystalTrialApplier();
    const result = await applier.apply(
      makeEnvelope([]),
      makeContext(),
    );
    expect(result).toEqual({ applied: false, reason: 'invalid' });
  });
});
