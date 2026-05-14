import type { TopicTheorySourceSpan } from './theorySourceSpans';
import type { CompiledTopicConceptSpec } from './topicPlanCompiler';

export const TOPIC_CONCEPT_PLAN_SCHEMA_VERSION = 1;
export const TOPIC_CARD_PLAN_SCHEMA_VERSION = 1;
export const TOPIC_PLAN_PROMPT_TEMPLATE_VERSION = 'backend-topic-plan-v1';

export interface TopicPlanSourceSpanSnapshot {
  sourceSpanId: string;
  kind: TopicTheorySourceSpan['kind'];
  index: number;
  difficulty?: number;
  text: string;
}

export interface TopicConceptPlanSnapshot {
  snapshot_version: 1;
  pipeline_kind: 'topic-concept-plan';
  schema_version: typeof TOPIC_CONCEPT_PLAN_SCHEMA_VERSION;
  prompt_template_version: string;
  model_id: string;
  captured_at: string;
  subject_id: string;
  topic_id: string;
  topic_title: string;
  learning_objective: string;
  source_spans: TopicPlanSourceSpanSnapshot[];
  syllabus_questions: string[];
  target_difficulties: number[];
}

export interface TopicCardPlanConceptSnapshot {
  concept_id: string;
  concept_key: string;
  title: string;
  summary: string;
  source_span_ids: string[];
  target_difficulties: number[];
  priority: number;
  source_spans: TopicPlanSourceSpanSnapshot[];
}

export interface TopicCardPlanSnapshot {
  snapshot_version: 1;
  pipeline_kind: 'topic-card-plan';
  schema_version: typeof TOPIC_CARD_PLAN_SCHEMA_VERSION;
  prompt_template_version: string;
  model_id: string;
  captured_at: string;
  subject_id: string;
  topic_id: string;
  topic_title: string;
  learning_objective: string;
  concepts: TopicCardPlanConceptSnapshot[];
  card_spec_target: number;
  mini_game_spec_target: number;
}

export interface BuildTopicConceptPlanSnapshotInput {
  subjectId: string;
  topicId: string;
  topicTitle: string;
  learningObjective: string;
  sourceSpans: readonly TopicTheorySourceSpan[];
  modelId: string;
  capturedAt: string;
  promptTemplateVersion?: string;
  targetDifficulties?: readonly number[];
}

export interface BuildTopicCardPlanSnapshotInput {
  subjectId: string;
  topicId: string;
  topicTitle: string;
  learningObjective: string;
  sourceSpans: readonly TopicTheorySourceSpan[];
  concepts: readonly CompiledTopicConceptSpec[];
  modelId: string;
  capturedAt: string;
  promptTemplateVersion?: string;
  cardSpecTarget?: number;
  miniGameSpecTarget?: number;
}

function requireNonEmptyString(label: string, value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireIsoTimestamp(label: string, value: string): string {
  const normalized = requireNonEmptyString(label, value);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${label} must be an ISO-8601 timestamp`);
  }
  return normalized;
}

function requirePositiveInteger(label: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function normalizeDifficulty(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`${label} must be an integer difficulty from 1 through 5`);
  }
  return value;
}

function normalizeDifficultyList(values: readonly number[], label: string): number[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must contain at least one difficulty`);
  }
  return [...new Set(values.map((value, index) => normalizeDifficulty(value, `${label}[${index}]`)))].sort((a, b) => a - b);
}

function assertScope(label: string, span: TopicTheorySourceSpan, subjectId: string, topicId: string): void {
  if (span.subjectId !== subjectId || span.topicId !== topicId) {
    throw new Error(`${label} must belong to subject ${subjectId} and topic ${topicId}`);
  }
}

function snapshotSpan(span: TopicTheorySourceSpan): TopicPlanSourceSpanSnapshot {
  return {
    sourceSpanId: requireNonEmptyString('sourceSpan.spanId', span.spanId),
    kind: span.kind,
    index: span.index,
    ...(span.difficulty === undefined ? {} : { difficulty: span.difficulty }),
    text: requireNonEmptyString(`sourceSpan ${span.spanId} text`, span.text),
  };
}

function snapshotSourceSpans(
  sourceSpans: readonly TopicTheorySourceSpan[],
  subjectId: string,
  topicId: string,
): TopicPlanSourceSpanSnapshot[] {
  if (!Array.isArray(sourceSpans) || sourceSpans.length === 0) {
    throw new Error('sourceSpans must contain at least one topic theory source span');
  }

  const seen = new Set<string>();
  return sourceSpans.map((span, index) => {
    assertScope(`sourceSpans[${index}]`, span, subjectId, topicId);
    if (seen.has(span.spanId)) {
      throw new Error(`sourceSpans[${index}].spanId duplicates ${span.spanId}`);
    }
    seen.add(span.spanId);
    return snapshotSpan(span);
  });
}

function deriveSyllabusQuestions(spans: readonly TopicPlanSourceSpanSnapshot[]): string[] {
  return spans
    .filter((span) => span.kind === 'syllabus-question')
    .sort((a, b) => (a.difficulty ?? 0) - (b.difficulty ?? 0) || a.index - b.index)
    .map((span) => span.text);
}

function deriveTargetDifficulties(spans: readonly TopicPlanSourceSpanSnapshot[]): number[] {
  const difficulties = spans
    .filter((span) => span.kind === 'syllabus-question' && span.difficulty !== undefined)
    .map((span) => span.difficulty as number);
  return difficulties.length === 0 ? [1, 2, 3, 4] : normalizeDifficultyList(difficulties, 'derived targetDifficulties');
}

export function buildTopicConceptPlanSnapshot(input: BuildTopicConceptPlanSnapshotInput): TopicConceptPlanSnapshot {
  const subjectId = requireNonEmptyString('subjectId', input.subjectId);
  const topicId = requireNonEmptyString('topicId', input.topicId);
  const sourceSpans = snapshotSourceSpans(input.sourceSpans, subjectId, topicId);

  return {
    snapshot_version: 1,
    pipeline_kind: 'topic-concept-plan',
    schema_version: TOPIC_CONCEPT_PLAN_SCHEMA_VERSION,
    prompt_template_version: input.promptTemplateVersion ?? TOPIC_PLAN_PROMPT_TEMPLATE_VERSION,
    model_id: requireNonEmptyString('modelId', input.modelId),
    captured_at: requireIsoTimestamp('capturedAt', input.capturedAt),
    subject_id: subjectId,
    topic_id: topicId,
    topic_title: requireNonEmptyString('topicTitle', input.topicTitle),
    learning_objective: requireNonEmptyString('learningObjective', input.learningObjective),
    source_spans: sourceSpans,
    syllabus_questions: deriveSyllabusQuestions(sourceSpans),
    target_difficulties: input.targetDifficulties === undefined
      ? deriveTargetDifficulties(sourceSpans)
      : normalizeDifficultyList(input.targetDifficulties, 'targetDifficulties'),
  };
}

function buildSpanLookup(spans: readonly TopicPlanSourceSpanSnapshot[]): Map<string, TopicPlanSourceSpanSnapshot> {
  return new Map(spans.map((span) => [span.sourceSpanId, span]));
}

export function buildTopicCardPlanSnapshot(input: BuildTopicCardPlanSnapshotInput): TopicCardPlanSnapshot {
  const subjectId = requireNonEmptyString('subjectId', input.subjectId);
  const topicId = requireNonEmptyString('topicId', input.topicId);
  const sourceSpans = snapshotSourceSpans(input.sourceSpans, subjectId, topicId);
  const spanLookup = buildSpanLookup(sourceSpans);

  if (!Array.isArray(input.concepts) || input.concepts.length === 0) {
    throw new Error('concepts must contain at least one compiled topic concept');
  }

  const seenConceptKeys = new Set<string>();
  const seenConceptIds = new Set<string>();
  const concepts = input.concepts.map((concept, index): TopicCardPlanConceptSnapshot => {
    if (concept.subjectId !== subjectId || concept.topicId !== topicId) {
      throw new Error(`concepts[${index}] must belong to subject ${subjectId} and topic ${topicId}`);
    }
    if (seenConceptKeys.has(concept.conceptKey)) {
      throw new Error(`concepts[${index}].conceptKey duplicates ${concept.conceptKey}`);
    }
    if (seenConceptIds.has(concept.conceptId)) {
      throw new Error(`concepts[${index}].conceptId duplicates ${concept.conceptId}`);
    }
    seenConceptKeys.add(concept.conceptKey);
    seenConceptIds.add(concept.conceptId);

    const conceptSourceSpans = concept.sourceSpanIds.map((spanId: string, spanIndex: number) => {
      const span = spanLookup.get(spanId);
      if (!span) {
        throw new Error(`concepts[${index}].sourceSpanIds[${spanIndex}] references unknown source span ${spanId}`);
      }
      return span;
    });

    return {
      concept_id: requireNonEmptyString(`concepts[${index}].conceptId`, concept.conceptId),
      concept_key: requireNonEmptyString(`concepts[${index}].conceptKey`, concept.conceptKey),
      title: requireNonEmptyString(`concepts[${index}].title`, concept.title),
      summary: requireNonEmptyString(`concepts[${index}].summary`, concept.summary),
      source_span_ids: [...concept.sourceSpanIds],
      target_difficulties: normalizeDifficultyList(concept.targetDifficulties, `concepts[${index}].targetDifficulties`),
      priority: requirePositiveInteger(`concepts[${index}].priority`, concept.priority),
      source_spans: conceptSourceSpans,
    };
  }).sort((a, b) => a.priority - b.priority || a.concept_key.localeCompare(b.concept_key));

  return {
    snapshot_version: 1,
    pipeline_kind: 'topic-card-plan',
    schema_version: TOPIC_CARD_PLAN_SCHEMA_VERSION,
    prompt_template_version: input.promptTemplateVersion ?? TOPIC_PLAN_PROMPT_TEMPLATE_VERSION,
    model_id: requireNonEmptyString('modelId', input.modelId),
    captured_at: requireIsoTimestamp('capturedAt', input.capturedAt),
    subject_id: subjectId,
    topic_id: topicId,
    topic_title: requireNonEmptyString('topicTitle', input.topicTitle),
    learning_objective: requireNonEmptyString('learningObjective', input.learningObjective),
    concepts,
    card_spec_target: requirePositiveInteger('cardSpecTarget', input.cardSpecTarget ?? Math.max(1, concepts.length * 2)),
    mini_game_spec_target: requirePositiveInteger('miniGameSpecTarget', input.miniGameSpecTarget ?? Math.max(1, concepts.length)),
  };
}
