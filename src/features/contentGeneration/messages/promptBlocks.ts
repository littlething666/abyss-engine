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
