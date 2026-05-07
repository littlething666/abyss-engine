import type { MiniGamePipelineKind } from '../contracts/generationContracts';

export type PromptMessage = { role: 'system' | 'user'; content: string };

export interface SubjectGraphTopicPromptTopic {
  topicId: string;
  title: string;
  tier: number;
  learningObjective: string;
  iconName?: string;
}

const MINI_GAME_LABEL_BY_KIND = {
  'topic-mini-game-category-sort': 'CATEGORY_SORT',
  'topic-mini-game-sequence-build': 'SEQUENCE_BUILD',
  'topic-mini-game-match-pairs': 'MATCH_PAIRS',
} as const satisfies Record<MiniGamePipelineKind, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object for backend prompt construction`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string for backend prompt construction`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, label);
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number for backend prompt construction`);
  }
  return value;
}

function requireInteger(value: unknown, label: string): number {
  const valueNumber = requireNumber(value, label);
  if (!Number.isInteger(valueNumber)) {
    throw new Error(`${label} must be an integer for backend prompt construction`);
  }
  return valueNumber;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings for backend prompt construction`);
  }
  return [...value] as string[];
}

function appendContentBrief(system: string, contentBrief: string | undefined): string {
  if (!contentBrief) return system;
  return `${system}\n\nSubject content brief:\n${contentBrief}`;
}

function formatList(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function formatBoolean(value: unknown, label: string): string {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean for backend prompt construction`);
  }
  return value ? 'yes' : 'no';
}

export function buildSubjectGraphTopicsMessages(snapshot: Record<string, unknown>): PromptMessage[] {
  const subjectId = requireString(snapshot.subject_id, 'snapshot.subject_id');
  const checklist = requireRecord(snapshot.checklist, 'snapshot.checklist');
  const strategy = requireRecord(snapshot.strategy_brief, 'snapshot.strategy_brief');
  const totalTiers = requireInteger(strategy.total_tiers, 'snapshot.strategy_brief.total_tiers');
  const topicsPerTier = requireInteger(strategy.topics_per_tier, 'snapshot.strategy_brief.topics_per_tier');
  const focusConstraints = typeof strategy.focus_constraints === 'string' ? strategy.focus_constraints.trim() : '';

  const system = [
    'You are an Abyss Engine Subject Graph Generation prompt module.',
    'Create the Stage A Topic Lattice for the requested Subject and return only JSON matching the subject-graph-topics schema.',
    '',
    `Subject id: ${subjectId}`,
    `Learner topic name: ${requireString(checklist.topic_name, 'snapshot.checklist.topic_name')}`,
    `Study goal: ${optionalString(checklist.study_goal, 'snapshot.checklist.study_goal') ?? 'not specified'}`,
    `Prior knowledge: ${optionalString(checklist.prior_knowledge, 'snapshot.checklist.prior_knowledge') ?? 'not specified'}`,
    `Learning style: ${optionalString(checklist.learning_style, 'snapshot.checklist.learning_style') ?? 'not specified'}`,
    `Focus areas: ${optionalString(checklist.focus_areas, 'snapshot.checklist.focus_areas') ?? 'not specified'}`,
    '',
    `Audience brief: ${requireString(strategy.audience_brief, 'snapshot.strategy_brief.audience_brief')}`,
    `Domain brief: ${requireString(strategy.domain_brief, 'snapshot.strategy_brief.domain_brief')}`,
    `Total tiers: ${totalTiers}`,
    `Topics per tier: ${topicsPerTier}`,
    `Total topics required: ${totalTiers * topicsPerTier}`,
    '',
    'Each topic must have topicId, title, iconName, tier, and learningObjective. Use stable kebab-case topicId values.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: focusConstraints ? `Learner focus constraints:\n${focusConstraints}\n\nGenerate the Topic Lattice now.` : 'Generate the Topic Lattice now.' },
  ];
}

function requirePromptTopics(topics: readonly SubjectGraphTopicPromptTopic[]): SubjectGraphTopicPromptTopic[] {
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error('Stage B prompt construction requires the Stage A Topic Lattice topics');
  }
  return topics.map((topic, index) => ({
    topicId: requireString(topic.topicId, `stageATopics[${index}].topicId`),
    title: requireString(topic.title, `stageATopics[${index}].title`),
    tier: requireInteger(topic.tier, `stageATopics[${index}].tier`),
    learningObjective: requireString(topic.learningObjective, `stageATopics[${index}].learningObjective`),
    iconName: typeof topic.iconName === 'string' ? topic.iconName : undefined,
  }));
}

export function buildSubjectGraphEdgesMessages(
  snapshot: Record<string, unknown>,
  stageATopics: readonly SubjectGraphTopicPromptTopic[],
): PromptMessage[] {
  const subjectId = requireString(snapshot.subject_id, 'snapshot.subject_id');
  const topics = requirePromptTopics(stageATopics);
  const latticeBlock = topics
    .map((topic) => `- ${topic.topicId} | tier ${topic.tier} | ${topic.title} | objective: ${topic.learningObjective}`)
    .join('\n');

  const system = [
    'You are an Abyss Engine Subject Graph Generation prompt module.',
    'Create Stage B Prerequisite Edges for the authoritative Topic Lattice and return only JSON matching the subject-graph-edges schema.',
    '',
    `Subject id: ${subjectId}`,
    `Lattice artifact content hash: ${requireString(snapshot.lattice_artifact_content_hash, 'snapshot.lattice_artifact_content_hash')}`,
    '',
    'Authoritative Topic Lattice:',
    latticeBlock,
    '',
    'Rules:',
    '- source and target must be topicId values from the authoritative lattice.',
    '- prerequisites must flow from a lower tier source to a higher tier target.',
    '- never create self-loops, same-tier edges, duplicate edges, or references to unknown topic ids.',
    '- include minLevel only when a higher Crystal Level than 1 is instructionally necessary.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Generate the prerequisite edges now. Output only the JSON object with the edges array.' },
  ];
}

export function buildTopicTheoryMessages(snapshot: Record<string, unknown>): PromptMessage[] {
  const system = [
    'You are an Abyss Engine Topic Content prompt module.',
    'Create rigorous Topic Content theory and return only JSON matching the topic-theory schema.',
    '',
    `Subject id: ${requireString(snapshot.subject_id, 'snapshot.subject_id')}`,
    `Topic id: ${requireString(snapshot.topic_id, 'snapshot.topic_id')}`,
    `Topic title: ${requireString(snapshot.topic_title, 'snapshot.topic_title')}`,
    `Learning objective: ${requireString(snapshot.learning_objective, 'snapshot.learning_objective')}`,
    '',
    'The response must include coreConcept, theory, keyTakeaways, and coreQuestionsByDifficulty for difficulties 1 through 4.',
  ].join('\n');

  return [{ role: 'system', content: appendContentBrief(system, optionalString(snapshot.content_brief, 'snapshot.content_brief')) }];
}

export function buildTopicStudyCardsMessages(snapshot: Record<string, unknown>): PromptMessage[] {
  const syllabusQuestions = requireStringArray(snapshot.syllabus_questions, 'snapshot.syllabus_questions');
  const system = [
    'You are an Abyss Engine Topic Content prompt module.',
    'Create study cards and return only JSON matching the topic-study-cards schema.',
    '',
    `Subject id: ${requireString(snapshot.subject_id, 'snapshot.subject_id')}`,
    `Topic id: ${requireString(snapshot.topic_id, 'snapshot.topic_id')}`,
    `Target difficulty: ${requireInteger(snapshot.target_difficulty, 'snapshot.target_difficulty')}`,
    `Grounding source count: ${requireInteger(snapshot.grounding_source_count, 'snapshot.grounding_source_count')}`,
    `Has authoritative primary source: ${formatBoolean(snapshot.has_authoritative_primary_source, 'snapshot.has_authoritative_primary_source')}`,
    '',
    'Syllabus questions:',
    formatList(syllabusQuestions),
    '',
    'Theory excerpt:',
    requireString(snapshot.theory_excerpt, 'snapshot.theory_excerpt'),
    '',
    'Create FLASHCARD, CLOZE, and MULTIPLE_CHOICE cards only. Every card topicId must equal the snapshot topic id.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Output only the JSON object with the cards array.' },
  ];
}

export function buildTopicMiniGameMessages(snapshot: Record<string, unknown>): PromptMessage[] {
  const pipelineKind = requireString(snapshot.pipeline_kind, 'snapshot.pipeline_kind') as MiniGamePipelineKind;
  const expectedGameType = MINI_GAME_LABEL_BY_KIND[pipelineKind];
  if (!expectedGameType) {
    throw new Error(`snapshot.pipeline_kind must be a topic-mini-game kind for backend prompt construction: ${pipelineKind}`);
  }

  const syllabusQuestions = requireStringArray(snapshot.syllabus_questions, 'snapshot.syllabus_questions');
  const system = [
    'You are an Abyss Engine Topic Content prompt module.',
    `Create playable ${expectedGameType} mini-game cards and return only JSON matching the ${pipelineKind} schema.`,
    '',
    `Subject id: ${requireString(snapshot.subject_id, 'snapshot.subject_id')}`,
    `Topic id: ${requireString(snapshot.topic_id, 'snapshot.topic_id')}`,
    `Expected gameType: ${expectedGameType}`,
    `Target difficulty: ${requireInteger(snapshot.target_difficulty, 'snapshot.target_difficulty')}`,
    `Grounding source count: ${requireInteger(snapshot.grounding_source_count, 'snapshot.grounding_source_count')}`,
    `Has authoritative primary source: ${formatBoolean(snapshot.has_authoritative_primary_source, 'snapshot.has_authoritative_primary_source')}`,
    '',
    'Syllabus questions:',
    formatList(syllabusQuestions),
    '',
    'Theory excerpt:',
    requireString(snapshot.theory_excerpt, 'snapshot.theory_excerpt'),
    '',
    `Every card must have type MINI_GAME, content.gameType ${expectedGameType}, and topicId equal to the snapshot topic id.`,
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Output only the JSON object with the cards array.' },
  ];
}

export function buildTopicExpansionMessages(snapshot: Record<string, unknown>): PromptMessage[] {
  const syllabusQuestions = requireStringArray(snapshot.syllabus_questions, 'snapshot.syllabus_questions');
  const existingConceptStems = requireStringArray(snapshot.existing_concept_stems, 'snapshot.existing_concept_stems');
  const existingCardIds = requireStringArray(snapshot.existing_card_ids, 'snapshot.existing_card_ids');
  const system = [
    'You are an Abyss Engine Topic Expansion prompt module.',
    'Create additional study cards for the next Crystal Level and return only JSON matching the topic-expansion-cards schema.',
    '',
    `Subject id: ${requireString(snapshot.subject_id, 'snapshot.subject_id')}`,
    `Topic id: ${requireString(snapshot.topic_id, 'snapshot.topic_id')}`,
    `Next Crystal Level: ${requireInteger(snapshot.next_level, 'snapshot.next_level')}`,
    `Difficulty: ${requireInteger(snapshot.difficulty, 'snapshot.difficulty')}`,
    `Grounding source count: ${requireInteger(snapshot.grounding_source_count, 'snapshot.grounding_source_count')}`,
    '',
    'Syllabus questions:',
    formatList(syllabusQuestions),
    '',
    'Existing card ids:',
    existingCardIds.length > 0 ? formatList(existingCardIds) : 'None.',
    '',
    'Existing concept stems to avoid:',
    existingConceptStems.length > 0 ? formatList(existingConceptStems) : 'None.',
    '',
    'Theory excerpt:',
    requireString(snapshot.theory_excerpt, 'snapshot.theory_excerpt'),
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Output only the JSON object with the cards array.' },
  ];
}

export function buildCrystalTrialMessages(snapshot: Record<string, unknown>): PromptMessage[] {
  const system = [
    'You are an Abyss Engine Crystal Trial prompt module.',
    'Create level-gating Crystal Trial questions and return only JSON matching the crystal-trial schema.',
    '',
    `Subject id: ${requireString(snapshot.subject_id, 'snapshot.subject_id')}`,
    `Topic id: ${requireString(snapshot.topic_id, 'snapshot.topic_id')}`,
    `Current Crystal Level: ${requireInteger(snapshot.current_level, 'snapshot.current_level')}`,
    `Target Crystal Level: ${requireInteger(snapshot.target_level, 'snapshot.target_level')}`,
    `Question count: ${requireInteger(snapshot.question_count, 'snapshot.question_count')}`,
    `Card pool hash: ${requireString(snapshot.card_pool_hash, 'snapshot.card_pool_hash')}`,
    '',
    'Questions must be scenario-based and must include sourceCardSummaries rooted in the card pool represented by the hash.',
  ].join('\n');

  return [
    { role: 'system', content: appendContentBrief(system, optionalString(snapshot.content_brief, 'snapshot.content_brief')) },
    { role: 'user', content: 'Output only the JSON object with the questions array.' },
  ];
}
