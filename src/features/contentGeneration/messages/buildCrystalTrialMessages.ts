import type { ChatMessage } from '@/types/llm';
import { appendContentBriefToSystem } from '@/lib/appendContentBriefToSystem';
import type { Card } from '@/types/core';
import crystalTrialTemplate from '@/prompts/crystal-trial.prompt';
import { interpolatePromptTemplate } from '@/lib/interpolatePromptTemplate';

export interface CrystalTrialPromptParams {
  topicId: string;
  topicTitle: string;
  targetLevel: number;
  /** Serialized card content at difficulty === (crystalLevel + 1). NO theory. */
  cardContext: string;
  questionCount: number;
  contentBrief?: string;
}

/**
 * Build the system prompt using the shared .prompt template.
 */
function buildSystemPrompt(params: CrystalTrialPromptParams): string {
  return interpolatePromptTemplate(crystalTrialTemplate, {
    topicId: params.topicId,
    topicTitle: params.topicTitle,
    targetLevel: `${params.targetLevel}`,
    cardContext: params.cardContext,
    questionCount: `${params.questionCount}`,
  });
}

export function buildCrystalTrialMessages(
  params: CrystalTrialPromptParams,
): ChatMessage[] {
  const systemContent = appendContentBriefToSystem(
    buildSystemPrompt(params),
    params.contentBrief,
  );

  return [
    { role: 'system', content: systemContent },
    {
      role: 'user',
      content: 'Output only the JSON object with the questions array.',
    },
  ];
}

/**
 * Serialize cards into a text context block for the LLM prompt.
 * Extracts key concepts from each card for the LLM to cluster.
 */
export function serializeCardsForPrompt(cards: Card[]): string {
  return cards
    .map((card, i) => {
      const idx = i + 1;
      switch (card.type) {
        case 'FLASHCARD': {
          const c = card.content as { front: string; back: string };
          return `[Card ${idx} - Flashcard]\nQ: ${c.front}\nA: ${c.back}`;
        }
        case 'SINGLE_CHOICE': {
          const c = card.content as {
            question: string;
            correctAnswer: string;
            explanation: string;
          };
          return `[Card ${idx} - Single Choice]\nQ: ${c.question}\nCorrect: ${c.correctAnswer}\nExplanation: ${c.explanation}`;
        }
        case 'MULTI_CHOICE': {
          const c = card.content as {
            question: string;
            correctAnswers: string[];
            explanation: string;
          };
          return `[Card ${idx} - Multi Choice]\nQ: ${c.question}\nCorrect: ${c.correctAnswers.join(', ')}\nExplanation: ${c.explanation}`;
        }
        case 'MINI_GAME': {
          const c = card.content as {
            gameType: string;
            prompt: string;
            explanation: string;
          };
          return `[Card ${idx} - Mini Game: ${c.gameType}]\nPrompt: ${c.prompt}\nExplanation: ${c.explanation}`;
        }
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('\n\n');
}
