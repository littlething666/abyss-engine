/**
 * Topic Expansion Artifact Applier — Phase 0.5 step 5.
 *
 * Applies `topic-expansion-cards` artifacts by converting canonical
 * card records to deck `Card[]` and appending them through
 * `deckWriter.appendTopicCards`.
 *
 * Supersession: when `topicExpansionTargetLevel` is set (from the run
 * snapshot’s `next_level`), compares against
 * `AppliedArtifactsStore.getLatestTopicExpansionScope` — a stale run whose
 * artifact arrives after a superseding run for the same target level returns
 * `{ applied: false, reason: 'superseded' }` so the composition root can
 * suppress player-facing failure copy (Plan v3 cancel/supersession gate).
 *
 * Exported through `src/features/contentGeneration/index.ts`.
 */

import type { Card } from '@/types/core';
import type { IDeckContentWriter } from '@/types/repository';
import type {
  ArtifactApplyContext,
  ArtifactApplier,
} from '@/features/generationContracts/artifacts/applier';
import type {
  ArtifactEnvelope,
  TopicExpansionCardsArtifactPayload,
} from '@/features/generationContracts';

// ---------------------------------------------------------------------------
// Dependency interface
// ---------------------------------------------------------------------------

export interface TopicExpansionApplierDeps {
  deckWriter: IDeckContentWriter;
}

// ---------------------------------------------------------------------------
// Card conversion (reuses same logic as topicContentApplier)
// ---------------------------------------------------------------------------

type CanonicalExpansionCard = TopicExpansionCardsArtifactPayload['cards'][number];

function toDeckCard(c: CanonicalExpansionCard): Card | null {
  const raw = c.content as Record<string, unknown>;

  if (c.type === 'FLASHCARD') {
    if (typeof raw.front !== 'string' || typeof raw.back !== 'string') return null;
    return {
      id: c.id,
      type: 'FLASHCARD',
      difficulty: c.difficulty,
      content: { front: raw.front, back: raw.back },
    };
  }

  if (c.type === 'MULTIPLE_CHOICE') {
    if (typeof raw.correctAnswer === 'string') {
      return {
        id: c.id,
        type: 'SINGLE_CHOICE',
        difficulty: c.difficulty,
        content: {
          question: String(raw.question ?? ''),
          options: Array.isArray(raw.options) ? raw.options.map(String) : [],
          correctAnswer: raw.correctAnswer,
          explanation: String(raw.explanation ?? ''),
        },
      };
    }
    if (Array.isArray(raw.correctAnswers)) {
      return {
        id: c.id,
        type: 'MULTI_CHOICE',
        difficulty: c.difficulty,
        content: {
          question: String(raw.question ?? ''),
          options: Array.isArray(raw.options) ? raw.options.map(String) : [],
          correctAnswers: raw.correctAnswers.map(String),
          explanation: String(raw.explanation ?? ''),
        },
      };
    }
    return null;
  }

  // CLOZE — not yet supported in deck.
  return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type TopicExpansionApplier = ArtifactApplier<'topic-expansion-cards'>;

export function createTopicExpansionApplier(
  deps: TopicExpansionApplierDeps,
): TopicExpansionApplier {
  return {
    kind: 'topic-expansion-cards',
    async apply(
      artifact: ArtifactEnvelope<'topic-expansion-cards'>,
      ctx: ArtifactApplyContext,
    ) {
      if (artifact.kind !== 'inline') {
        return { applied: false, reason: 'invalid' };
      }
      const contentHash = artifact.artifact.contentHash;
      const { subjectId, topicId } = ctx;
      if (!subjectId || !topicId) {
        return { applied: false, reason: 'invalid' };
      }

      if (await ctx.dedupeStore.has(contentHash)) {
        return { applied: false, reason: 'duplicate' };
      }

      const targetLevel = ctx.topicExpansionTargetLevel;
      if (targetLevel != null) {
        const latest = await ctx.dedupeStore.getLatestTopicExpansionScope(
          subjectId,
          topicId,
        );
        if (latest != null) {
          if (latest.targetLevel > targetLevel) {
            return { applied: false, reason: 'superseded' };
          }
          if (
            latest.targetLevel === targetLevel &&
            latest.contentHash !== contentHash
          ) {
            return { applied: false, reason: 'superseded' };
          }
        }
      }

      const payload = artifact.artifact.payload as unknown as TopicExpansionCardsArtifactPayload;
      const cards: Card[] = [];
      for (const c of payload.cards) {
        const card = toDeckCard(c);
        if (card) cards.push(card);
      }
      if (cards.length === 0) {
        return { applied: false, reason: 'invalid' };
      }

      await deps.deckWriter.appendTopicCards(subjectId, topicId, cards);
      await ctx.dedupeStore.record(
        contentHash,
        'topic-expansion-cards',
        ctx.now(),
        targetLevel != null
          ? {
              variant: 'topic-expansion',
              subjectId,
              topicId,
              targetLevel,
            }
          : undefined,
      );

      return { applied: true };
    },
  };
}
