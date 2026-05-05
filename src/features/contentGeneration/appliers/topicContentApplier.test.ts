/**
 * Tests for `topicContentApplier` — Phase 0.5 step 5.
 */

import { describe, it, expect, vi } from 'vitest';

import { createTopicContentApplier } from './topicContentApplier';
import type {
  ArtifactApplyContext,
  AppliedArtifactRecordScope,
  AppliedArtifactsStore,
  ArtifactApplier,
} from '@/features/generationContracts/artifacts/applier';
import type { IDeckContentWriter, IDeckRepository } from '@/types/repository';

function makeMockDedupeStore(): AppliedArtifactDedupeStore {
  const records = new Map<
    string,
    { kind: string; appliedAt: number; scope?: AppliedArtifactRecordScope }
  >();
  return {
    records,
    async has(contentHash) {
      return records.has(contentHash);
    },
    async record(contentHash, kind, appliedAt, scope?) {
      records.set(contentHash, { kind, appliedAt, scope });
    },
    async getLatestTopicExpansionScope() {
      return null;
    },
  };
}

type AppliedArtifactDedupeStore = AppliedArtifactsStore & {
  records: Map<
    string,
    { kind: string; appliedAt: number; scope?: AppliedArtifactRecordScope }
  >;
};

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

type TopicContentArtifactKinds = Parameters<TopicContentApplier['apply']>[0];

function theoryEnvelope(
  payload: Record<string, unknown>,
  contentHash = 'cnt_test',
): TopicContentArtifactKinds {
  return {
    kind: 'inline',
    artifact: {
      id: 'art-1',
      kind: 'topic-theory',
      contentHash,
      inputHash: 'inp_test',
      schemaVersion: 1,
      createdByRunId: 'run-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload,
    },
  } as unknown as TopicContentArtifactKinds;
}

function signedUrlEnvelope(): TopicContentArtifactKinds {
  return {
    kind: 'signed-url',
    meta: {
      id: 'art-1',
      kind: 'topic-theory',
      contentHash: 'cnt_x',
      inputHash: 'inp_x',
      schemaVersion: 1,
      createdByRunId: 'run-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload: {},
    },
    url: 'https://example.com',
    expiresAt: '2026-01-02T00:00:00.000Z',
  } as unknown as TopicContentArtifactKinds;
}

function studyCardsEnvelope(
  cards: Array<Record<string, unknown>>,
  contentHash?: string,
): TopicContentArtifactKinds {
  return {
    kind: 'inline',
    artifact: {
      id: 'art-2',
      kind: 'topic-study-cards',
      contentHash: contentHash ?? 'cnt_sc',
      inputHash: 'inp_sc',
      schemaVersion: 1,
      createdByRunId: 'run-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload: { cards },
    },
  } as unknown as TopicContentArtifactKinds;
}

function miniGameEnvelope(
  cards: Array<Record<string, unknown>>,
): TopicContentArtifactKinds {
  return {
    kind: 'inline',
    artifact: {
      id: 'art-3',
      kind: 'topic-mini-game-category-sort',
      contentHash: 'cnt_mg',
      inputHash: 'inp_mg',
      schemaVersion: 1,
      createdByRunId: 'run-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload: { cards },
    },
  } as unknown as TopicContentArtifactKinds;
}

type TopicContentApplier = ReturnType<typeof createTopicContentApplier>;

describe('topicContentApplier', () => {
  it('returns duplicate when contentHash already applied', async () => {
    const store = makeMockDedupeStore();
    await store.record('cnt_theory', 'topic-theory', 500);
    const applier = createTopicContentApplier({
      deckWriter: { upsertTopicDetails: vi.fn() } as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const ctx = makeContext({ dedupeStore: store });
    const result = await applier.apply(
      theoryEnvelope({
        coreConcept: 'Test',
        theory: 'Some theory',
        keyTakeaways: ['a', 'b', 'c', 'd'],
        coreQuestionsByDifficulty: { '1': ['q1'], '2': ['q2'], '3': ['q3'], '4': ['q4'] },
      }, 'cnt_theory'),
      ctx,
    );
    expect(result).toEqual({ applied: false, reason: 'duplicate' });
  });

  it('returns invalid for signed-url envelope', async () => {
    const applier = createTopicContentApplier({
      deckWriter: {} as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const result = await applier.apply(signedUrlEnvelope(), makeContext());
    expect(result).toEqual({ applied: false, reason: 'invalid' });
  });

  it('applies theory artifact → upsertTopicDetails', async () => {
    const upsertTopicDetails = vi.fn();
    const getTopicDetails = vi.fn().mockResolvedValue({
      topicId: 'top-1',
      subjectId: 'sub-a',
      title: 'Old Title',
      coreConcept: 'Old Concept',
      theory: 'Old Theory',
      keyTakeaways: ['old1'],
    });

    const applier = createTopicContentApplier({
      deckWriter: { upsertTopicDetails } as unknown as IDeckContentWriter,
      deckRepository: { getTopicDetails } as unknown as IDeckRepository,
    });
    const ctx = makeContext();
    const result = await applier.apply(
      theoryEnvelope({
        coreConcept: 'New Concept',
        theory: 'New Theory',
        keyTakeaways: ['a', 'b', 'c', 'd'],
        coreQuestionsByDifficulty: { '1': ['q1'], '2': ['q2'], '3': ['q3'], '4': ['q4'] },
      }),
      ctx,
    );

    expect(result).toEqual({ applied: true });
    expect(upsertTopicDetails).toHaveBeenCalledOnce();
    expect(upsertTopicDetails.mock.calls[0][0]).toMatchObject({
      subjectId: 'sub-a',
      topicId: 'top-1',
      coreConcept: 'New Concept',
      theory: 'New Theory',
      keyTakeaways: ['a', 'b', 'c', 'd'],
    });
  });

  it('applies study-cards artifact → upsertTopicCards with FLASHCARD conversion', async () => {
    const upsertTopicCards = vi.fn();
    const applier = createTopicContentApplier({
      deckWriter: { upsertTopicCards } as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const ctx = makeContext();
    const result = await applier.apply(
      studyCardsEnvelope([
        {
          id: 'card-1',
          topicId: 'top-1',
          type: 'FLASHCARD',
          difficulty: 2,
          content: { front: 'What is X?', back: 'X is Y' },
        },
      ]),
      ctx,
    );

    expect(result).toEqual({ applied: true });
    expect(upsertTopicCards).toHaveBeenCalledOnce();
    const cardsArg = upsertTopicCards.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(cardsArg).toHaveLength(1);
    expect(cardsArg[0]).toEqual({
      id: 'card-1',
      type: 'FLASHCARD',
      difficulty: 2,
      content: { front: 'What is X?', back: 'X is Y' },
    });
  });

  it('applies study-cards artifact → upsertTopicCards with MULTIPLE_CHOICE → SINGLE_CHOICE conversion', async () => {
    const upsertTopicCards = vi.fn();
    const applier = createTopicContentApplier({
      deckWriter: { upsertTopicCards } as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const result = await applier.apply(
      studyCardsEnvelope([
        {
          id: 'card-2',
          topicId: 'top-1',
          type: 'MULTIPLE_CHOICE',
          difficulty: 1,
          content: {
            question: 'Pick one',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 'B',
            explanation: 'Because',
          },
        },
      ]),
      makeContext(),
    );

    expect(result).toEqual({ applied: true });
    const cardsArg = upsertTopicCards.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(cardsArg[0]).toMatchObject({
      id: 'card-2',
      type: 'SINGLE_CHOICE',
      difficulty: 1,
    });
  });

  it('skips CLOZE cards (not yet supported in deck)', async () => {
    const applier = createTopicContentApplier({
      deckWriter: { upsertTopicCards: vi.fn() } as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const result = await applier.apply(
      studyCardsEnvelope([
        {
          id: 'card-c',
          topicId: 'top-1',
          type: 'CLOZE',
          difficulty: 2,
          content: { text: 'Fill the {{blank}}', blanks: ['blank'] },
        },
      ]),
      makeContext(),
    );
    expect(result).toEqual({ applied: false, reason: 'invalid' });
  });

  it('applies mini-game artifact → appendTopicCards', async () => {
    const appendTopicCards = vi.fn();
    const applier = createTopicContentApplier({
      deckWriter: { appendTopicCards } as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const result = await applier.apply(
      miniGameEnvelope([
        {
          id: 'mg-1',
          topicId: 'top-1',
          type: 'MINI_GAME',
          difficulty: 2,
          content: {
            gameType: 'CATEGORY_SORT',
            prompt: 'Sort these',
            categories: [{ id: 'cat-1', label: 'Group A' }],
            items: [{ id: 'item-1', label: 'Item 1', categoryId: 'cat-1' }],
            explanation: 'Done',
          },
        },
      ]),
      makeContext(),
    );

    expect(result).toEqual({ applied: true });
    expect(appendTopicCards).toHaveBeenCalledOnce();
    const cardsArg = appendTopicCards.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(cardsArg[0]).toMatchObject({
      id: 'mg-1',
      type: 'MINI_GAME',
      difficulty: 2,
    });
  });

  it('returns invalid when subjectId is missing', async () => {
    const applier = createTopicContentApplier({
      deckWriter: {} as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const result = await applier.apply(
      theoryEnvelope({
        coreConcept: 'Test',
        theory: 'Theory',
        keyTakeaways: ['a', 'b', 'c', 'd'],
        coreQuestionsByDifficulty: { '1': ['q1'], '2': ['q2'], '3': ['q3'], '4': ['q4'] },
      }),
      makeContext({ subjectId: undefined }),
    );
    expect(result).toEqual({ applied: false, reason: 'invalid' });
  });

  it('returns invalid for unknown artifact kind', async () => {
    const applier = createTopicContentApplier({
      deckWriter: {} as unknown as IDeckContentWriter,
      deckRepository: {} as unknown as IDeckRepository,
    });
    const result = await applier.apply(
      {
        kind: 'inline',
        artifact: {
          id: 'art-ct',
          kind: 'crystal-trial',
          contentHash: 'cnt_ct',
          inputHash: 'inp_ct',
          schemaVersion: 1,
          createdByRunId: 'run-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          payload: { questions: [{ id: 'q1', category: 'interview', scenario: 'S', question: 'Q', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: 'E', sourceCardSummaries: ['S1'] }] },
        },
      } as unknown as TopicContentArtifactKinds,
      makeContext(),
    );
    expect(result).toEqual({ applied: false, reason: 'invalid' });
  });
});
