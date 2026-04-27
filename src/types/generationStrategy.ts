import type { CognitiveMode, ForbiddenContentPattern } from './contentQuality';

export interface GraphStrategy {
  totalTiers: number;
  topicsPerTier: number;
  audienceBrief: string;
  domainBrief: string;
  focusConstraints: string;
}

export interface ContentStrategy {
  theoryDepth: 'concise' | 'standard' | 'comprehensive';
  cardMix: {
    flashcardWeight: number;
    choiceWeight: number;
    miniGameWeight: number;
  };
  difficultyBias: 'foundational' | 'balanced' | 'challenging';
  cognitiveModeMix: Partial<Record<CognitiveMode, number>>;
  forbiddenPatterns: ForbiddenContentPattern[];
  contentBrief: string;
}

export interface GenerationStrategy {
  graph: GraphStrategy;
  content: ContentStrategy;
}
