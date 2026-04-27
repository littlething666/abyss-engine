import type { MiniGameAffordanceSet } from '@/types/contentQuality';
import type { ContentStrategy } from '@/types/generationStrategy';
import type { GroundingSource } from '@/types/grounding';

function numberedLines(values: string[]): string {
  return values.map((value, index) => `${index + 1}. ${value}`).join('\n');
}

export function formatSyllabusQuestionsBlock(questions: string[]): string {
  return numberedLines(questions);
}

export function formatGroundingSourcesBlock(sources: GroundingSource[] | undefined): string {
  if (!sources?.length) return 'No accepted grounding sources were provided.';
  return sources
    .map((source, index) => {
      const publisher = source.publisher ? `, ${source.publisher}` : '';
      return `${index + 1}. ${source.title}${publisher} (${source.trustLevel}) — ${source.url}`;
    })
    .join('\n');
}

export function formatContentStrategyBlock(strategy: ContentStrategy | undefined): string {
  if (!strategy) return 'Use the learner brief below as the content strategy.';
  const modes = Object.entries(strategy.cognitiveModeMix)
    .map(([mode, weight]) => `${mode}: ${Math.round((weight ?? 0) * 100)}%`)
    .join(', ');
  const forbidden = strategy.forbiddenPatterns.join(', ');
  return [
    `Theory depth: ${strategy.theoryDepth}`,
    `Difficulty bias: ${strategy.difficultyBias}`,
    `Card mix weights: flashcard ${strategy.cardMix.flashcardWeight.toFixed(2)}, choice ${strategy.cardMix.choiceWeight.toFixed(2)}, mini-game ${strategy.cardMix.miniGameWeight.toFixed(2)}`,
    `Cognitive mode mix: ${modes}`,
    `Forbidden content patterns: ${forbidden}`,
  ].join('\n');
}

export function formatMiniGameAffordancesBlock(affordances: MiniGameAffordanceSet | undefined): string {
  if (!affordances) return 'No structured mini-game affordances were provided.';
  const categorySets = affordances.categorySets
    .map((set) => `- ${set.label}: categories [${set.categories.join(', ')}]; candidate items [${set.candidateItems.join(', ')}]`)
    .join('\n');
  const sequences = affordances.orderedSequences
    .map((set) => `- ${set.label}: ${set.steps.join(' -> ')}`)
    .join('\n');
  const pairs = affordances.connectionPairs
    .map((set) => `- ${set.label}: ${set.pairs.map((pair) => `${pair.left} = ${pair.right}`).join('; ')}`)
    .join('\n');
  return [
    'Category sort anchors:',
    categorySets || '- none',
    'Sequence anchors:',
    sequences || '- none',
    'Connection web anchors:',
    pairs || '- none',
  ].join('\n');
}
