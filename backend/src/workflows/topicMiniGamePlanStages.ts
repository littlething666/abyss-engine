import type {
  CompiledTopicCardPlan,
  CompiledTopicMiniGameSpec,
  TopicPlannedMiniGameType,
} from '../learningContent';

export const TOPIC_MINI_GAME_TYPES = [
  'CATEGORY_SORT',
  'SEQUENCE_BUILD',
  'MATCH_PAIRS',
] as const satisfies readonly TopicPlannedMiniGameType[];

export type TopicMiniGameType = typeof TOPIC_MINI_GAME_TYPES[number];
export type TopicMiniGameStage = `mini-games:${TopicMiniGameType}`;

export interface ResolvePlannedTopicMiniGameStagesInput {
  wantedStages: readonly string[];
  cardPlan: CompiledTopicCardPlan | null;
}

export interface TopicMiniGameSpecPromptRecord {
  mini_game_spec_id: string;
  concept_id: string;
  concept_key: string;
  mini_game_key: string;
  game_type: TopicMiniGameType;
  difficulty: number;
  prompt: string;
  source_span_ids: string[];
  learning_objective?: string;
}

function stageForGameType(gameType: TopicMiniGameType): TopicMiniGameStage {
  return `mini-games:${gameType}`;
}

function gameTypeFromStage(stage: string): TopicMiniGameType | null {
  const candidate = stage.startsWith('mini-games:') ? stage.slice('mini-games:'.length) : '';
  return TOPIC_MINI_GAME_TYPES.includes(candidate as TopicMiniGameType)
    ? candidate as TopicMiniGameType
    : null;
}

function stableStringList(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function compareMiniGameSpecs(a: CompiledTopicMiniGameSpec, b: CompiledTopicMiniGameSpec): number {
  return a.difficulty - b.difficulty
    || a.conceptKey.localeCompare(b.conceptKey)
    || a.miniGameKey.localeCompare(b.miniGameKey)
    || a.miniGameSpecId.localeCompare(b.miniGameSpecId);
}

function wantedMiniGameTypes(wantedStages: readonly string[]): Set<TopicMiniGameType> {
  return new Set(
    wantedStages
      .map(gameTypeFromStage)
      .filter((gameType): gameType is TopicMiniGameType => gameType !== null),
  );
}

export function resolvePlannedTopicMiniGameStages(input: ResolvePlannedTopicMiniGameStagesInput): TopicMiniGameStage[] {
  const wantedTypes = wantedMiniGameTypes(input.wantedStages);
  if (wantedTypes.size === 0) return [];

  if (!input.cardPlan) {
    return TOPIC_MINI_GAME_TYPES
      .filter((gameType) => wantedTypes.has(gameType))
      .map(stageForGameType);
  }

  const plannedTypes = new Set(input.cardPlan.miniGameSpecs.map((spec) => spec.gameType as TopicMiniGameType));
  return TOPIC_MINI_GAME_TYPES
    .filter((gameType) => wantedTypes.has(gameType) && plannedTypes.has(gameType))
    .map(stageForGameType);
}

export function compiledMiniGameSpecsForType(
  cardPlan: CompiledTopicCardPlan,
  gameType: TopicMiniGameType,
): CompiledTopicMiniGameSpec[] {
  return cardPlan.miniGameSpecs
    .filter((spec) => spec.gameType === gameType)
    .sort(compareMiniGameSpecs);
}

export function sourceSpanIdsForMiniGameType(
  cardPlan: CompiledTopicCardPlan,
  gameType: TopicMiniGameType,
): string[] {
  return stableStringList(compiledMiniGameSpecsForType(cardPlan, gameType).flatMap((spec) => spec.sourceSpanIds));
}

export function miniGameSpecsForPrompt(
  specs: readonly CompiledTopicMiniGameSpec[],
): TopicMiniGameSpecPromptRecord[] {
  return [...specs].sort(compareMiniGameSpecs).map((spec) => ({
    mini_game_spec_id: spec.miniGameSpecId,
    concept_id: spec.conceptId,
    concept_key: spec.conceptKey,
    mini_game_key: spec.miniGameKey,
    game_type: spec.gameType as TopicMiniGameType,
    difficulty: spec.difficulty,
    prompt: spec.prompt,
    source_span_ids: [...spec.sourceSpanIds],
    ...(spec.learningObjective === undefined ? {} : { learning_objective: spec.learningObjective }),
  }));
}
