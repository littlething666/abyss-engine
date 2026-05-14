import type {
  CompiledTopicCardPlan,
  CompiledTopicCardSpec,
  TopicPlannedCardType,
} from '../learningContent';

export interface TopicStudyCardSpecPromptRecord {
  card_spec_id: string;
  concept_id: string;
  concept_key: string;
  card_key: string;
  card_type: TopicPlannedCardType;
  difficulty: number;
  prompt: string;
  source_span_ids: string[];
  learning_objective?: string;
}

function stableStringList(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function compareCardSpecs(a: CompiledTopicCardSpec, b: CompiledTopicCardSpec): number {
  return a.difficulty - b.difficulty
    || a.conceptKey.localeCompare(b.conceptKey)
    || a.cardKey.localeCompare(b.cardKey)
    || a.cardSpecId.localeCompare(b.cardSpecId);
}

export function compiledStudyCardSpecsForPrompt(
  specs: readonly CompiledTopicCardSpec[],
): TopicStudyCardSpecPromptRecord[] {
  return [...specs].sort(compareCardSpecs).map((spec) => ({
    card_spec_id: spec.cardSpecId,
    concept_id: spec.conceptId,
    concept_key: spec.conceptKey,
    card_key: spec.cardKey,
    card_type: spec.cardType,
    difficulty: spec.difficulty,
    prompt: spec.prompt,
    source_span_ids: [...spec.sourceSpanIds],
    ...(spec.learningObjective === undefined ? {} : { learning_objective: spec.learningObjective }),
  }));
}

export function sourceSpanIdsForStudyCardSpecs(cardPlan: CompiledTopicCardPlan): string[] {
  return stableStringList(cardPlan.cardSpecs.flatMap((spec) => spec.sourceSpanIds));
}
