/**
 * Phase 0.5 — reconstruct durable-contract artifacts from persisted deck state
 * after legacy in-tab runners complete. Used only by
 * `LocalGenerationRunRepository` synthetic `artifact.ready` emission.
 */

import type {
  Card,
  FlashcardContent,
  MultiChoiceContent,
  SingleChoiceContent,
  SubjectGraph,
} from '@/types/core';
import type { IDeckRepository, TopicContentRunInputSnapshot } from '@/types/repository';
import type {
  ArtifactKind,
  GenerationFailureCode,
  SubjectGraphEdgesArtifactPayload,
} from '@/features/generationContracts';
import {
  contentHash,
  crystalTrialSchemaVersion,
  strictParseArtifact,
  subjectGraphEdgesSchemaVersion,
  subjectGraphTopicsSchemaVersion,
  topicExpansionCardsSchemaVersion,
  topicMiniGameCategorySortSchemaVersion,
  topicMiniGameMatchPairsSchemaVersion,
  topicMiniGameSequenceBuildSchemaVersion,
  topicStudyCardsSchemaVersion,
  topicTheorySchemaVersion,
} from '@/features/generationContracts';
import { loadTheoryPayloadFromTopicDetails } from '@/features/contentGeneration/pipelines/loadTheoryPayloadFromTopicDetails';

export type SealedArtifact = {
  kind: ArtifactKind;
  schemaVersion: number;
  contentHash: string;
  payload: unknown;
};

/** Matches {@link LocalGenerationRunRepository} dispatcher terminal shape (no circular import). */
export type CapturedArtifactBundle =
  | { status: 'success'; artifacts: SealedArtifact[] }
  | { status: 'failure'; code: GenerationFailureCode; message: string };

async function sealParsedArtifact(
  kind: ArtifactKind,
  payload: unknown,
  schemaVersion: number,
): Promise<
  | { ok: true; sealed: SealedArtifact }
  | { ok: false; code: GenerationFailureCode; message: string }
> {
  const raw = JSON.stringify(payload);
  const parsed = strictParseArtifact(kind, raw);
  if (!parsed.ok) {
    return {
      ok: false,
      code: parsed.failureCode,
      message: parsed.message,
    };
  }
  const ch = await contentHash(parsed.payload);
  return {
    ok: true,
    sealed: {
      kind,
      schemaVersion,
      contentHash: ch,
      payload: parsed.payload,
    },
  };
}

function edgesPayloadFromSubjectGraph(graph: SubjectGraph): SubjectGraphEdgesArtifactPayload {
  const edges: SubjectGraphEdgesArtifactPayload['edges'] = [];
  for (const node of graph.nodes) {
    for (const p of node.prerequisites) {
      if (typeof p === 'string') {
        edges.push({ source: p, target: node.topicId });
      } else {
        edges.push({
          source: p.topicId,
          target: node.topicId,
          minLevel: p.minLevel,
        });
      }
    }
  }
  return { edges };
}

function mapStudyLikeCard(topicId: string, card: Card): Record<string, unknown> | null {
  if (card.type === 'FLASHCARD') {
    const c = card.content as FlashcardContent;
    return {
      id: card.id,
      topicId,
      type: 'FLASHCARD',
      difficulty: card.difficulty,
      content: { front: c.front, back: c.back },
    };
  }
  if (card.type === 'SINGLE_CHOICE') {
    const c = card.content as SingleChoiceContent;
    return {
      id: card.id,
      topicId,
      type: 'MULTIPLE_CHOICE',
      difficulty: card.difficulty,
      content: {
        question: c.question,
        options: c.options,
        correctAnswer: c.correctAnswer,
        explanation: c.explanation,
      },
    };
  }
  if (card.type === 'MULTI_CHOICE') {
    const c = card.content as MultiChoiceContent;
    return {
      id: card.id,
      topicId,
      type: 'MULTIPLE_CHOICE',
      difficulty: card.difficulty,
      content: {
        question: c.question,
        options: c.options,
        correctAnswers: c.correctAnswers,
        explanation: c.explanation,
      },
    };
  }
  return null;
}

function miniGameArtifactKind(
  pipelineKind: TopicMiniGamePipelineKind,
): Extract<
  ArtifactKind,
  | 'topic-mini-game-category-sort'
  | 'topic-mini-game-sequence-build'
  | 'topic-mini-game-match-pairs'
> {
  switch (pipelineKind) {
    case 'topic-mini-game-category-sort':
      return 'topic-mini-game-category-sort';
    case 'topic-mini-game-sequence-build':
      return 'topic-mini-game-sequence-build';
    case 'topic-mini-game-match-pairs':
      return 'topic-mini-game-match-pairs';
    default: {
      const _e: never = pipelineKind;
      return _e;
    }
  }
}

type TopicMiniGamePipelineKind =
  | 'topic-mini-game-category-sort'
  | 'topic-mini-game-sequence-build'
  | 'topic-mini-game-match-pairs';

function schemaVersionForMiniGameKind(kind: ArtifactKind): number {
  switch (kind) {
    case 'topic-mini-game-category-sort':
      return topicMiniGameCategorySortSchemaVersion;
    case 'topic-mini-game-sequence-build':
      return topicMiniGameSequenceBuildSchemaVersion;
    case 'topic-mini-game-match-pairs':
      return topicMiniGameMatchPairsSchemaVersion;
    default:
      throw new Error(`Unexpected mini-game artifact kind: ${kind}`);
  }
}

/**
 * After a successful legacy topic-content run, rebuild contract artifacts from
 * IndexedDB-backed deck reads so `artifact.ready` carries strict-parseable
 * payloads aligned with Phase 0 schemas.
 */
export async function collectTopicContentArtifactsForSnapshot(
  deckRepository: IDeckRepository,
  subjectId: string,
  topicId: string,
  snapshot: TopicContentRunInputSnapshot,
): Promise<CapturedArtifactBundle> {
  const details = await deckRepository.getTopicDetails(subjectId, topicId);
  const cards = await deckRepository.getTopicCards(subjectId, topicId);
  const sealed: SealedArtifact[] = [];

  const pushTheory = async (): Promise<CapturedArtifactBundle | null> => {
    const loaded = loadTheoryPayloadFromTopicDetails(details);
    const theoryPayload = {
      coreConcept: loaded.coreConcept,
      theory: loaded.theory,
      keyTakeaways: loaded.keyTakeaways,
      coreQuestionsByDifficulty: loaded.coreQuestionsByDifficulty,
    };
    const r = await sealParsedArtifact('topic-theory', theoryPayload, topicTheorySchemaVersion);
    if (!r.ok) {
      return { status: 'failure', code: r.code, message: r.message };
    }
    sealed.push(r.sealed);
    return null;
  };

  const pushStudyCards = async (): Promise<CapturedArtifactBundle | null> => {
    const studyRows = cards
      .map((c) => mapStudyLikeCard(topicId, c))
      .filter((row): row is Record<string, unknown> => row !== null);
    const r = await sealParsedArtifact(
      'topic-study-cards',
      { cards: studyRows },
      topicStudyCardsSchemaVersion,
    );
    if (!r.ok) {
      return { status: 'failure', code: r.code, message: r.message };
    }
    sealed.push(r.sealed);
    return null;
  };

  const pushMiniGame = async (kind: ArtifactKind): Promise<CapturedArtifactBundle | null> => {
    const expectedGameType =
      kind === 'topic-mini-game-category-sort'
        ? 'CATEGORY_SORT'
        : kind === 'topic-mini-game-sequence-build'
          ? 'SEQUENCE_BUILD'
          : 'MATCH_PAIRS';
    const miniCards = cards.filter(
      (c) =>
        c.type === 'MINI_GAME' &&
        (c.content as { gameType?: string }).gameType === expectedGameType,
    );
    const payload = {
      cards: miniCards.map((c) => ({
        id: c.id,
        topicId,
        type: 'MINI_GAME' as const,
        content: c.content,
        difficulty: c.difficulty,
      })),
    };
    const r = await sealParsedArtifact(kind, payload, schemaVersionForMiniGameKind(kind));
    if (!r.ok) {
      return { status: 'failure', code: r.code, message: r.message };
    }
    sealed.push(r.sealed);
    return null;
  };

  switch (snapshot.pipeline_kind) {
    case 'topic-theory': {
      const err = await pushTheory();
      if (err) return err;
      break;
    }
    case 'topic-study-cards': {
      let err = await pushTheory();
      if (err) return err;
      err = await pushStudyCards();
      if (err) return err;
      break;
    }
    case 'topic-mini-game-category-sort':
    case 'topic-mini-game-sequence-build':
    case 'topic-mini-game-match-pairs': {
      let err = await pushTheory();
      if (err) return err;
      err = await pushStudyCards();
      if (err) return err;
      const mgKind = miniGameArtifactKind(snapshot.pipeline_kind);
      err = await pushMiniGame(mgKind);
      if (err) return err;
      break;
    }
  }

  return { status: 'success', artifacts: sealed };
}

export async function sealExpansionCards(topicId: string, cards: Card[]): Promise<CapturedArtifactBundle> {
  if (cards.length === 0) {
    return {
      status: 'failure',
      code: 'precondition:missing-topic',
      message: 'Expansion job produced no cards to seal.',
    };
  }
  const rows: Record<string, unknown>[] = [];
  for (const c of cards) {
    const row = mapStudyLikeCard(topicId, c);
    if (row !== null) rows.push(row);
  }
  const r = await sealParsedArtifact(
    'topic-expansion-cards',
    { cards: rows },
    topicExpansionCardsSchemaVersion,
  );
  if (!r.ok) {
    return { status: 'failure', code: r.code, message: r.message };
  }
  return { status: 'success', artifacts: [r.sealed] };
}

export async function sealCrystalTrialQuestions(questions: unknown): Promise<CapturedArtifactBundle> {
  const r = await sealParsedArtifact(
    'crystal-trial',
    { questions },
    crystalTrialSchemaVersion,
  );
  if (!r.ok) {
    return { status: 'failure', code: r.code, message: r.message };
  }
  return { status: 'success', artifacts: [r.sealed] };
}

export async function sealSubjectGraphTopics(
  topicsPayload: { topics: unknown[] },
): Promise<CapturedArtifactBundle> {
  const r = await sealParsedArtifact(
    'subject-graph-topics',
    topicsPayload,
    subjectGraphTopicsSchemaVersion,
  );
  if (!r.ok) {
    return { status: 'failure', code: r.code, message: r.message };
  }
  return { status: 'success', artifacts: [r.sealed] };
}

export async function sealSubjectGraphEdges(graph: SubjectGraph): Promise<CapturedArtifactBundle> {
  const payload = edgesPayloadFromSubjectGraph(graph);
  const r = await sealParsedArtifact(
    'subject-graph-edges',
    payload,
    subjectGraphEdgesSchemaVersion,
  );
  if (!r.ok) {
    return { status: 'failure', code: r.code, message: r.message };
  }
  return { status: 'success', artifacts: [r.sealed] };
}
