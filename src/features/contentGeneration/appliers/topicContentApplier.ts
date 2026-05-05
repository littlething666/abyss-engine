/**
 * Topic Content Artifact Applier — Phase 0.5 step 5.
 *
 * Composes three `ArtifactKind`s into a single composite applier:
 *   - `topic-theory`       → `deckWriter.upsertTopicDetails`
 *   - `topic-study-cards`  → `deckWriter.upsertTopicCards`
 *   - `topic-mini-game-*`  → `deckWriter.appendTopicCards`
 *
 * Idempotent by `contentHash` via the context's `dedupeStore`.
 * Exported through `src/features/contentGeneration/index.ts`.
 */

import type {
  Card,
  CardType,
  FlashcardContent,
  MiniGameContent,
  MultiChoiceContent,
  SingleChoiceContent,
  TopicDetails,
} from '@/types/core';
import type { IDeckContentWriter, IDeckRepository } from '@/types/repository';
import type {
  ArtifactApplyContext,
  ArtifactApplier,
} from '@/features/generationContracts/artifacts/applier';
import type {
  ArtifactEnvelope,
  ArtifactKind,
  TopicMiniGameCategorySortArtifactPayload,
  TopicMiniGameMatchPairsArtifactPayload,
  TopicMiniGameSequenceBuildArtifactPayload,
  TopicStudyCardsArtifactPayload,
  TopicTheoryArtifactPayload,
} from '@/features/generationContracts';

// ---------------------------------------------------------------------------
// Dependency interface
// ---------------------------------------------------------------------------

export interface TopicContentApplierDeps {
  deckWriter: IDeckContentWriter;
  deckRepository: IDeckRepository;
}

// ---------------------------------------------------------------------------
// Card conversion (canonical → deck Card)
// ---------------------------------------------------------------------------

type CanonicalStudyCard = TopicStudyCardsArtifactPayload['cards'][number];

type CanonicalMiniGameCard =
  | TopicMiniGameCategorySortArtifactPayload['cards'][number]
  | TopicMiniGameSequenceBuildArtifactPayload['cards'][number]
  | TopicMiniGameMatchPairsArtifactPayload['cards'][number];

function deckCardType(canonicalType: string): CardType {
  switch (canonicalType) {
    case 'FLASHCARD':
      return 'FLASHCARD';
    case 'MULTIPLE_CHOICE':
      // Canonical MULTIPLE_CHOICE may carry `correctAnswer` (singular)
      // or `correctAnswers` (plural). The deck uses SINGLE_CHOICE for
      // singular and MULTI_CHOICE for plural.
      return 'SINGLE_CHOICE'; // default; caller refines below
    default:
      // CLOZE not yet supported in deck — applier skips.
      return 'FLASHCARD';
  }
}

function toDeckStudyCard(c: CanonicalStudyCard): Card | null {
  const ctype = deckCardType(c.type);

  if (c.type === 'FLASHCARD') {
    const raw = c.content as Record<string, unknown>;
    if (typeof raw.front !== 'string' || typeof raw.back !== 'string') {
      return null;
    }
    const content: FlashcardContent = { front: raw.front, back: raw.back };
    return { id: c.id, type: ctype, difficulty: c.difficulty, content };
  }

  if (c.type === 'MULTIPLE_CHOICE') {
    const raw = c.content as Record<string, unknown>;
    // SINGLE_CHOICE path: canonical payload has `correctAnswer` (singular string)
    if (typeof raw.correctAnswer === 'string') {
      const content: SingleChoiceContent = {
        question: String(raw.question ?? ''),
        options: Array.isArray(raw.options) ? raw.options.map(String) : [],
        correctAnswer: raw.correctAnswer,
        explanation: String(raw.explanation ?? ''),
      };
      return { id: c.id, type: 'SINGLE_CHOICE', difficulty: c.difficulty, content };
    }
    // MULTI_CHOICE path: canonical payload has `correctAnswers` (string[])
    if (Array.isArray(raw.correctAnswers)) {
      const content: MultiChoiceContent = {
        question: String(raw.question ?? ''),
        options: Array.isArray(raw.options) ? raw.options.map(String) : [],
        correctAnswers: raw.correctAnswers.map(String),
        explanation: String(raw.explanation ?? ''),
      };
      return { id: c.id, type: 'MULTI_CHOICE', difficulty: c.difficulty, content };
    }
    return null;
  }

  // CLOZE — not yet supported in deck. Skip silently; the schema allows
  // CLOZE cards but the deck has no CardType or content shape for them yet.
  return null;
}

function toDeckMiniGameCard(c: CanonicalMiniGameCard): Card | null {
  const raw = c.content as Record<string, unknown>;
  // The mini-game schema guarantees content.gameType matches the artifact kind,
  // so we can cast safely.
  if (!raw.gameType) return null;
  const content = c.content as MiniGameContent;
  return { id: c.id, type: 'MINI_GAME', difficulty: c.difficulty, content };
}

// ---------------------------------------------------------------------------
// Per-kind apply helpers
// ---------------------------------------------------------------------------

async function applyTheory(
  artifact: ArtifactEnvelope<'topic-theory'>,
  ctx: ArtifactApplyContext,
  deps: TopicContentApplierDeps,
): Promise<{ applied: boolean; reason?: 'duplicate' | 'superseded' | 'missing-stage-a' | 'invalid' }> {
  if (artifact.kind !== 'inline') {
    return { applied: false, reason: 'invalid' };
  }
  const contentHash = artifact.artifact.contentHash;
  if (await ctx.dedupeStore.has(contentHash)) {
    return { applied: false, reason: 'duplicate' };
  }

  const payload = artifact.artifact.payload as unknown as TopicTheoryArtifactPayload;
  const { subjectId, topicId } = ctx;
  if (!subjectId || !topicId) {
    return { applied: false, reason: 'invalid' };
  }

  // Read existing details, merge theory fields
  const existing = await deps.deckRepository.getTopicDetails(subjectId, topicId);
  const merged: TopicDetails = {
    ...existing,
    coreConcept: payload.coreConcept,
    theory: payload.theory,
    keyTakeaways: payload.keyTakeaways,
    coreQuestionsByDifficulty: payload.coreQuestionsByDifficulty as TopicDetails['coreQuestionsByDifficulty'],
  };

  await deps.deckWriter.upsertTopicDetails(merged);
  await ctx.dedupeStore.record(contentHash, 'topic-theory', ctx.now());
  return { applied: true };
}

async function applyStudyCards(
  artifact: ArtifactEnvelope<'topic-study-cards'>,
  ctx: ArtifactApplyContext,
  deps: TopicContentApplierDeps,
): Promise<{ applied: boolean; reason?: 'duplicate' | 'superseded' | 'missing-stage-a' | 'invalid' }> {
  if (artifact.kind !== 'inline') {
    return { applied: false, reason: 'invalid' };
  }
  const contentHash = artifact.artifact.contentHash;
  if (await ctx.dedupeStore.has(contentHash)) {
    return { applied: false, reason: 'duplicate' };
  }

  const payload = artifact.artifact.payload as unknown as TopicStudyCardsArtifactPayload;
  const { subjectId, topicId } = ctx;
  if (!subjectId || !topicId) {
    return { applied: false, reason: 'invalid' };
  }

  const cards: Card[] = [];
  for (const c of payload.cards) {
    const card = toDeckStudyCard(c);
    if (card) cards.push(card);
  }
  if (cards.length === 0) {
    return { applied: false, reason: 'invalid' };
  }

  await deps.deckWriter.upsertTopicCards(subjectId, topicId, cards);
  await ctx.dedupeStore.record(contentHash, 'topic-study-cards', ctx.now());
  return { applied: true };
}

async function applyMiniGame(
  artifact: ArtifactEnvelope<
    'topic-mini-game-category-sort' | 'topic-mini-game-sequence-build' | 'topic-mini-game-match-pairs'
  >,
  ctx: ArtifactApplyContext,
  deps: TopicContentApplierDeps,
): Promise<{ applied: boolean; reason?: 'duplicate' | 'superseded' | 'missing-stage-a' | 'invalid' }> {
  if (artifact.kind !== 'inline') {
    return { applied: false, reason: 'invalid' };
  }
  const contentHash = artifact.artifact.contentHash;
  if (await ctx.dedupeStore.has(contentHash)) {
    return { applied: false, reason: 'duplicate' };
  }

  const payload = artifact.artifact.payload as unknown as
    | TopicMiniGameCategorySortArtifactPayload
    | TopicMiniGameSequenceBuildArtifactPayload
    | TopicMiniGameMatchPairsArtifactPayload;
  const { subjectId, topicId } = ctx;
  if (!subjectId || !topicId) {
    return { applied: false, reason: 'invalid' };
  }

  const cards: Card[] = [];
  for (const c of payload.cards) {
    const card = toDeckMiniGameCard(c);
    if (card) cards.push(card);
  }
  if (cards.length === 0) {
    return { applied: false, reason: 'invalid' };
  }

  // Append, not upsert — mini-game cards should not replace study cards.
  await deps.deckWriter.appendTopicCards(subjectId, topicId, cards);
  await ctx.dedupeStore.record(contentHash, artifact.artifact.kind as ArtifactKind, ctx.now());
  return { applied: true };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type TopicContentApplier = ArtifactApplier<
  'topic-theory' | 'topic-study-cards' | 'topic-mini-game-category-sort' | 'topic-mini-game-sequence-build' | 'topic-mini-game-match-pairs'
>;

export function createTopicContentApplier(
  deps: TopicContentApplierDeps,
): TopicContentApplier {
  return {
    kind: 'topic-theory' as TopicContentApplier['kind'],
    async apply(
      artifact: ArtifactEnvelope,
      ctx: ArtifactApplyContext,
    ) {
      // Determine the artifact kind from the envelope to dispatch.
      const a = artifact.kind === 'inline' ? artifact.artifact : artifact.meta;
      const k = a.kind as ArtifactKind;

      switch (k) {
        case 'topic-theory':
          return applyTheory(
            artifact as ArtifactEnvelope<'topic-theory'>,
            ctx,
            deps,
          );
        case 'topic-study-cards':
          return applyStudyCards(
            artifact as ArtifactEnvelope<'topic-study-cards'>,
            ctx,
            deps,
          );
        case 'topic-mini-game-category-sort':
        case 'topic-mini-game-sequence-build':
        case 'topic-mini-game-match-pairs':
          return applyMiniGame(
            artifact as ArtifactEnvelope<
              'topic-mini-game-category-sort' | 'topic-mini-game-sequence-build' | 'topic-mini-game-match-pairs'
            >,
            ctx,
            deps,
          );
        default:
          return { applied: false, reason: 'invalid' as const };
      }
    },
  };
}
