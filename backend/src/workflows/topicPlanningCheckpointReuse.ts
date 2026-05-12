import type {
  CompiledTopicConceptSpec,
  TopicCardPlanCheckpointPayload,
  TopicConceptPlanCheckpointPayload,
} from '../learningContent';

export interface TopicConceptPlanCheckpointReuseInput {
  checkpoint: TopicConceptPlanCheckpointPayload;
  subjectId: string;
  topicId: string;
  sourceSpanIds: readonly string[];
}

export interface TopicCardPlanCheckpointReuseInput {
  checkpoint: TopicCardPlanCheckpointPayload;
  subjectId: string;
  topicId: string;
  concepts: readonly CompiledTopicConceptSpec[];
}

function stableStringList(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  const left = stableStringList(a);
  const right = stableStringList(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function conceptRefsFromConcepts(concepts: readonly CompiledTopicConceptSpec[]): Array<{ concept_id: string; concept_key: string; source_span_ids: string[] }> {
  return [...concepts]
    .map((concept) => ({
      concept_id: concept.conceptId,
      concept_key: concept.conceptKey,
      source_span_ids: stableStringList(concept.sourceSpanIds),
    }))
    .sort((a, b) => a.concept_key.localeCompare(b.concept_key) || a.concept_id.localeCompare(b.concept_id));
}

export function isTopicConceptPlanCheckpointReusable(input: TopicConceptPlanCheckpointReuseInput): boolean {
  if (input.checkpoint.subject_id !== input.subjectId || input.checkpoint.topic_id !== input.topicId) {
    return false;
  }
  return sameStringSet(input.checkpoint.source_span_ids, input.sourceSpanIds);
}

export function isTopicCardPlanCheckpointReusable(input: TopicCardPlanCheckpointReuseInput): boolean {
  if (input.checkpoint.subject_id !== input.subjectId || input.checkpoint.topic_id !== input.topicId) {
    return false;
  }

  const expected = conceptRefsFromConcepts(input.concepts);
  if (input.checkpoint.compiled_concept_refs.length !== expected.length) {
    return false;
  }

  return input.checkpoint.compiled_concept_refs.every((actual, index) => {
    const exp = expected[index];
    return exp !== undefined
      && actual.concept_id === exp.concept_id
      && actual.concept_key === exp.concept_key
      && sameStringSet(actual.source_span_ids, exp.source_span_ids);
  });
}
