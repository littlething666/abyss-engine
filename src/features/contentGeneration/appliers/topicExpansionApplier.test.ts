/**
 * Tests for `topicExpansionApplier` — Phase 0.5 step 5.
 */

import { describe, it, expect, vi } from 'vitest';

import { createTopicExpansionApplier } from './topicExpansionApplier';
import type {
  ArtifactApplyContext,
  AppliedArtifactRecordScope,
  AppliedArtifactsStore,
} from '@/features/generationContracts/artifacts/applier';
import type { IDeckContentWriter } from '@/types/repository';

type ExpansionDedupeRow = {
  kind: string;
  appliedAt: number;
  scope?: AppliedArtifactRecordScope;
};

function makeMockDedupeStore(): AppliedArtifactsStore & { records: Map<string, ExpansionDedupeRow> } {
  const records = new Map<string, ExpansionDedupeRow>();
  return {
    records,
    async has(contentHash) {
      return records.has(contentHash);
    },
    async record(contentHash, kind, appliedAt, scope?) {
      records.set(contentHash, { kind, appliedAt, scope });
    },
    async getLatestTopicExpansionScope(subjectId, topicId) {
      let best: { contentHash: string; targetLevel: number; appliedAt: number } | null = null;
      for (const [ch, v] of records) {
        if (v.kind !== 'topic-expansion-cards') continue;
        if (v.scope?.variant !== 'topic-expansion') continue;
        if (v.scope.subjectId !== subjectId || v.scope.topicId !== topicId) continue;
        if (!best || v.appliedAt >= best.appliedAt) {
          best = {
            contentHash: ch,
            targetLevel: v.scope.targetLevel,
            appliedAt: v.appliedAt,
          };
        }
      }
      return best;
    },
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

type ExpansionArtifactEnvelope = Parameters<ReturnType<typeof createTopicExpansionApplier>['apply']>[0];

function makeEnvelope(payload: unknown, contentHash = 'cnt_exp1'): ExpansionArtifactEnvelope {
  return {
    kind: 'inline',
    artifact: {
      id: 'art-1',
      kind: 'topic-expansion-cards',
      contentHash,
      inputHash: 'inp_x',
      schemaVersion: 1,
      createdByRunId: 'run-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload,
    },
  } as ExpansionArtifactEnvelope;
}

function signedUrlEnvelope(): ExpansionArtifactEnvelope {
  return {
    kind: 'signed-url',
    meta: {
      id: 'art-1',
      kind: 'topic-expansion-cards',
      contentHash: 'cnt_x',
      inputHash: 'inp_x',
      schemaVersion: 1,
      createdByRunId: 'run-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload: {},
    },
    url: 'https://example.com',
    expiresAt: '2026-01-02T00:00:00.000Z',
  } as ExpansionArtifactEnvelope;
}

describe('topicExpansionApplier', () => {
  it('returns duplicate when contentHash already applied', async () => {
    const store = makeMockDedupeStore();
    await store.record('cnt_exp1', 'topic-expansion-cards', 500);
    const applier = createTopicExpansionApplier({
      deckWriter: {} as unknown as IDeckContentWriter,
    });
    const result = await applier.apply(
      makeEnvelope({ cards: [] }, 'cnt_exp1'),
      makeContext({ dedupeStore: store }),
    );
    expect(result).toEqual({ applied: false, reason: 'duplicate' });
  });

  it('returns invalid for signed-url envelope', async () => {
    const applier = createTopicExpansionApplier({
      deckWriter: {} as unknown as IDeckContentWriter,
    });
    const result = await applier.apply(signedUrlEnvelope(), makeContext());
    expect(result).toEqual({ applied: false, reason: 'invalid' });
  });

  it('applies expansion cards → appendTopicCards', async () => {
    const appendTopicCards = vi.fn();
    const applier = createTopicExpansionApplier({
      deckWriter: { appendTopicCards } as unknown as IDeckContentWriter,
    });
    const result = await applier.apply(
      makeEnvelope({
        cards: [
          {
            id: 'exp-1',
            topicId: 'top-1',
            type: 'FLASHCARD',
            difficulty: 3,
            content: { front: 'Q', back: 'A' },
          },
        ],
      }),
      makeContext(),
    );

    expect(result).toEqual({ applied: true });
    expect(appendTopicCards).toHaveBeenCalledOnce();
    const cardsArg = appendTopicCards.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(cardsArg).toEqual([
      {
        id: 'exp-1',
        type: 'FLASHCARD',
        difficulty: 3,
        content: { front: 'Q', back: 'A' },
      },
    ]);
  });

  it('returns superseded when a later expansion was already applied', async () => {
    const store = makeMockDedupeStore();
    // Apply a newer expansion first
    const applier1 = createTopicExpansionApplier({
      deckWriter: { appendTopicCards: vi.fn() } as unknown as IDeckContentWriter,
    });
    await applier1.apply(
      makeEnvelope({
        cards: [
          { id: 'new-1', topicId: 'top-1', type: 'FLASHCARD', difficulty: 4, content: { front: 'Q2', back: 'A2' } },
        ],
      }, 'cnt_newer'),
      makeContext({ dedupeStore: store, topicExpansionTargetLevel: 6 }),
    );

    // Now apply a stale expansion — should be superseded
    const applier2 = createTopicExpansionApplier({
      deckWriter: { appendTopicCards: vi.fn() } as unknown as IDeckContentWriter,
    });
    const result = await applier2.apply(
      makeEnvelope({
        cards: [
          { id: 'old-1', topicId: 'top-1', type: 'FLASHCARD', difficulty: 3, content: { front: 'Q', back: 'A' } },
        ],
      }, 'cnt_older'),
      makeContext({ dedupeStore: store, topicExpansionTargetLevel: 6 }),
    );

    expect(result).toEqual({ applied: false, reason: 'superseded' });
  });

  it('allows a higher targetLevel after a lower one was applied', async () => {
    const appendTopicCards = vi.fn();
    const store = makeMockDedupeStore();
    const applier = createTopicExpansionApplier({
      deckWriter: { appendTopicCards } as unknown as IDeckContentWriter,
    });
    await applier.apply(
      makeEnvelope(
        {
          cards: [
            { id: 'a1', topicId: 'top-1', type: 'FLASHCARD', difficulty: 3, content: { front: 'Q', back: 'A' } },
          ],
        },
        'cnt_lv6',
      ),
      makeContext({ dedupeStore: store, topicExpansionTargetLevel: 6 }),
    );
    const result = await applier.apply(
      makeEnvelope(
        {
          cards: [
            { id: 'b1', topicId: 'top-1', type: 'FLASHCARD', difficulty: 3, content: { front: 'Q2', back: 'A2' } },
          ],
        },
        'cnt_lv7',
      ),
      makeContext({ dedupeStore: store, topicExpansionTargetLevel: 7 }),
    );
    expect(result).toEqual({ applied: true });
    expect(appendTopicCards).toHaveBeenCalledTimes(2);
  });

  it('returns invalid when subjectId is missing', async () => {
    const applier = createTopicExpansionApplier({
      deckWriter: {} as unknown as IDeckContentWriter,
    });
    const result = await applier.apply(
      makeEnvelope({
        cards: [
          { id: 'x-1', topicId: 'top-1', type: 'FLASHCARD', difficulty: 2, content: { front: 'Q', back: 'A' } },
        ],
      }),
      makeContext({ subjectId: undefined }),
    );
    expect(result).toEqual({ applied: false, reason: 'invalid' });
  });

  it('converts MULTIPLE_CHOICE → SINGLE_CHOICE in expansion cards', async () => {
    const appendTopicCards = vi.fn();
    const applier = createTopicExpansionApplier({
      deckWriter: { appendTopicCards } as unknown as IDeckContentWriter,
    });
    const result = await applier.apply(
      makeEnvelope({
        cards: [
          {
            id: 'mc-1',
            topicId: 'top-1',
            type: 'MULTIPLE_CHOICE',
            difficulty: 2,
            content: { question: 'What?', options: ['X', 'Y'], correctAnswer: 'X', explanation: 'Because' },
          },
        ],
      }),
      makeContext(),
    );
    expect(result).toEqual({ applied: true });
    const cardsArg = appendTopicCards.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(cardsArg[0]).toMatchObject({
      type: 'SINGLE_CHOICE',
      content: { correctAnswer: 'X' },
    });
  });
});
