import {
  SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE,
  SEMANTIC_TOPIC_ICON_NAMES_ALLOWLIST,
  type MiniGamePipelineKind,
} from '../contracts/generationContracts';

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

function formatStudyCardSemanticRules(topicId: string, difficulty: number, options: { includeMinimum: boolean }): string {
  return [
    'Study-card semantic requirements:',
    ...(options.includeMinimum ? [`- Generate at least ${SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE} deck-compatible cards.`] : []),
    '- Allowed card.type values: FLASHCARD and MULTIPLE_CHOICE only.',
    '- Do not generate CLOZE cards; the current deck read model does not materialize CLOZE.',
    '- Backend materialization deterministically assigns persisted card IDs; any model-generated id is temporary and will be ignored.',
    '- Every card object must include topicId, type, difficulty, and content.',
    '- Every card.topicId must equal the snapshot topic id.',
    `- Every card.difficulty must equal ${difficulty}.`,
    '- FLASHCARD content must contain non-empty string fields front and back.',
    '- MULTIPLE_CHOICE content must contain question, options, explanation, and correctAnswer or correctAnswers.',
    '- MULTIPLE_CHOICE question and explanation must be non-empty strings.',
    '- MULTIPLE_CHOICE options must be an array of non-empty strings.',
    '- MULTIPLE_CHOICE correctAnswer must be one string copied exactly from options, or correctAnswers must be a non-empty array of strings copied exactly from options.',
    '- Do not use alternate content keys such as prompt, answer, term, definition, choices, correctOption, or rationale.',
    '',
    'Valid FLASHCARD shape:',
    `{"id":"temporary-id-ignored-by-backend","topicId":"${topicId}","type":"FLASHCARD","difficulty":${difficulty},"content":{"front":"<question or term>","back":"<answer or explanation>"}}`,
    '',
    'Valid MULTIPLE_CHOICE shape:',
    `{"id":"temporary-id-ignored-by-backend","topicId":"${topicId}","type":"MULTIPLE_CHOICE","difficulty":${difficulty},"content":{"question":"<question>","options":["<option A>","<option B>","<option C>"],"correctAnswer":"<one option copied exactly>","explanation":"<why the answer is correct>"}}`,
  ].join('\n');
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


function requireRecordArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !isRecord(item))) {
    throw new Error(`${label} must be a non-empty array of JSON objects for backend prompt construction`);
  }
  return value.map((item) => item as Record<string, unknown>);
}

function optionalRecordArray(value: unknown, label: string): Record<string, unknown>[] {
  if (value === undefined) return [];
  return requireRecordArray(value, label);
}

function formatCompiledMiniGameSpecRecords(specs: readonly Record<string, unknown>[]): string {
  return specs.map((spec, index) => {
    const specId = requireString(spec.mini_game_spec_id, `snapshot.compiled_mini_game_specs[${index}].mini_game_spec_id`);
    const conceptKey = requireString(spec.concept_key, `snapshot.compiled_mini_game_specs[${index}].concept_key`);
    const miniGameKey = requireString(spec.mini_game_key, `snapshot.compiled_mini_game_specs[${index}].mini_game_key`);
    const gameType = requireString(spec.game_type, `snapshot.compiled_mini_game_specs[${index}].game_type`);
    const difficulty = requireInteger(spec.difficulty, `snapshot.compiled_mini_game_specs[${index}].difficulty`);
    const prompt = requireString(spec.prompt, `snapshot.compiled_mini_game_specs[${index}].prompt`);
    const sourceSpanIds = requireStringArray(spec.source_span_ids, `snapshot.compiled_mini_game_specs[${index}].source_span_ids`);
    const learningObjective = spec.learning_objective === undefined
      ? ''
      : `\n  Learning objective: ${requireString(spec.learning_objective, `snapshot.compiled_mini_game_specs[${index}].learning_objective`)}`;
    return [
      `- ${miniGameKey} | ${specId}`,
      `  Concept: ${conceptKey}`,
      `  Game type: ${gameType}`,
      `  Difficulty: ${difficulty}`,
      `  Source spans: ${sourceSpanIds.join(', ')}`,
      `  Prompt: ${prompt}${learningObjective}`,
    ].join('\n');
  }).join('\n');
}

function requireIntegerArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array of integers for backend prompt construction`);
  }
  return value.map((item, index) => requireInteger(item, `${label}[${index}]`));
}

function formatSourceSpanRecords(spans: readonly Record<string, unknown>[], label: string): string {
  return spans.map((span, index) => {
    const sourceSpanId = requireString(span.sourceSpanId, `${label}[${index}].sourceSpanId`);
    const kind = requireString(span.kind, `${label}[${index}].kind`);
    const text = requireString(span.text, `${label}[${index}].text`);
    const difficulty = span.difficulty === undefined ? '' : ` difficulty ${requireInteger(span.difficulty, `${label}[${index}].difficulty`)}`;
    return `- [${sourceSpanId} | ${kind}${difficulty}] ${text}`;
  }).join('\n');
}

function formatConceptRecords(concepts: readonly Record<string, unknown>[]): string {
  return concepts.map((concept, index) => {
    const conceptKey = requireString(concept.concept_key, `snapshot.concepts[${index}].concept_key`);
    const title = requireString(concept.title, `snapshot.concepts[${index}].title`);
    const summary = requireString(concept.summary, `snapshot.concepts[${index}].summary`);
    const sourceSpanIds = requireStringArray(concept.source_span_ids, `snapshot.concepts[${index}].source_span_ids`);
    const targetDifficulties = requireIntegerArray(concept.target_difficulties, `snapshot.concepts[${index}].target_difficulties`);
    const sourceSpans = requireRecordArray(concept.source_spans, `snapshot.concepts[${index}].source_spans`);
    return [
      `Concept ${index + 1}: ${conceptKey} | ${title}`,
      `Summary: ${summary}`,
      `Target difficulties: ${targetDifficulties.join(', ')}`,
      `Allowed sourceSpanIds for this concept: ${sourceSpanIds.join(', ')}`,
      'Allowed source spans:',
      formatSourceSpanRecords(sourceSpans, `snapshot.concepts[${index}].source_spans`),
    ].join('\n');
  }).join('\n\n');
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
    '',
    'Topic iconName rules:',
    '- Each topic iconName must be copied verbatim from the allowed list below (exact spelling and hyphenation).',
    '- Do not invent Lucide icon names or pick variants that are not listed.',
    '',
    'Allowed topic iconName values:',
    formatList([...SEMANTIC_TOPIC_ICON_NAMES_ALLOWLIST]),
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

export function buildTopicConceptPlanMessages(snapshot: Record<string, unknown>): PromptMessage[] {
  const sourceSpans = requireRecordArray(snapshot.source_spans, 'snapshot.source_spans');
  const syllabusQuestions = Array.isArray(snapshot.syllabus_questions)
    ? requireStringArray(snapshot.syllabus_questions, 'snapshot.syllabus_questions')
    : [];
  const targetDifficulties = requireIntegerArray(snapshot.target_difficulties, 'snapshot.target_difficulties');

  const system = [
    'You are an Abyss Engine Topic Content planning prompt module.',
    'Create a compact concept plan and return only JSON matching the backend-local topic-concept-plan schema.',
    '',
    `Subject id: ${requireString(snapshot.subject_id, 'snapshot.subject_id')}`,
    `Topic id: ${requireString(snapshot.topic_id, 'snapshot.topic_id')}`,
    `Topic title: ${requireString(snapshot.topic_title, 'snapshot.topic_title')}`,
    `Learning objective: ${requireString(snapshot.learning_objective, 'snapshot.learning_objective')}`,
    `Target difficulties: ${targetDifficulties.join(', ')}`,
    '',
    'Syllabus questions:',
    syllabusQuestions.length > 0 ? formatList(syllabusQuestions) : 'None supplied; derive concepts from the source spans.',
    '',
    'Allowed source spans. Copy sourceSpanId values exactly; do not invent span IDs:',
    formatSourceSpanRecords(sourceSpans, 'snapshot.source_spans'),
    '',
    'Output requirements:',
    '- Return exactly one JSON object with a concepts array.',
    '- Each concept must include conceptKey, title, summary, sourceSpanIds, targetDifficulties, and priority.',
    '- conceptKey must be a stable local key using letters, numbers, dot, underscore, colon, or hyphen. Prefer lowercase kebab-case.',
    '- sourceSpanIds must be a non-empty subset copied exactly from the allowed source spans above.',
    '- Use the smallest sourceSpanIds set that fully grounds the concept.',
    '- targetDifficulties must be selected from the target difficulties listed above.',
    '- Do not emit conceptId or other backend-owned IDs; backend compilation deterministically assigns authoritative IDs.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Output only the JSON object with the concepts array.' },
  ];
}

export function buildTopicCardPlanMessages(snapshot: Record<string, unknown>): PromptMessage[] {
  const concepts = requireRecordArray(snapshot.concepts, 'snapshot.concepts');
  const cardSpecTarget = requireInteger(snapshot.card_spec_target, 'snapshot.card_spec_target');
  const miniGameSpecTarget = requireInteger(snapshot.mini_game_spec_target, 'snapshot.mini_game_spec_target');
  const system = [
    'You are an Abyss Engine Topic Content planning prompt module.',
    'Create a card and mini-game spec plan and return only JSON matching the backend-local topic-card-plan schema.',
    '',
    `Subject id: ${requireString(snapshot.subject_id, 'snapshot.subject_id')}`,
    `Topic id: ${requireString(snapshot.topic_id, 'snapshot.topic_id')}`,
    `Topic title: ${requireString(snapshot.topic_title, 'snapshot.topic_title')}`,
    `Learning objective: ${requireString(snapshot.learning_objective, 'snapshot.learning_objective')}`,
    `Card spec target: ${cardSpecTarget}`,
    `Mini-game spec target: ${miniGameSpecTarget}`,
    '',
    'Authoritative compiled concepts and allowed grounding spans:',
    formatConceptRecords(concepts),
    '',
    'Output requirements:',
    '- Return exactly one JSON object with cardSpecs and miniGameSpecs arrays.',
    '- Every cardSpec must include cardKey, conceptKey, cardType, difficulty, prompt, sourceSpanIds, and optionally learningObjective.',
    '- cardType must be FLASHCARD or MULTIPLE_CHOICE.',
    '- Every miniGameSpec must include miniGameKey, conceptKey, gameType, difficulty, prompt, sourceSpanIds, and optionally learningObjective.',
    '- gameType must be CATEGORY_SORT, SEQUENCE_BUILD, or MATCH_PAIRS.',
    '- conceptKey must be copied exactly from one authoritative concept above.',
    '- sourceSpanIds for each spec must be a non-empty subset of that concept\'s allowed sourceSpanIds.',
    '- Use explicit, narrow sourceSpanId grounding; never reference source spans from another concept.',
    '- Do not emit cardSpecId, miniGameSpecId, conceptId, or other backend-owned IDs; backend compilation deterministically assigns authoritative IDs.',
    '- Create specs in dependency order: foundational lower-difficulty cards first, then higher-difficulty cards, then mini-game specs.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Output only the JSON object with cardSpecs and miniGameSpecs arrays.' },
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
  const topicId = requireString(snapshot.topic_id, 'snapshot.topic_id');
  const targetDifficulty = requireInteger(snapshot.target_difficulty, 'snapshot.target_difficulty');
  const system = [
    'You are an Abyss Engine Topic Content prompt module.',
    `Create at least ${SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE} deck-compatible study cards and return only JSON matching the topic-study-cards schema.`,
    '',
    `Subject id: ${requireString(snapshot.subject_id, 'snapshot.subject_id')}`,
    `Topic id: ${topicId}`,
    `Target difficulty: ${targetDifficulty}`,
    `Grounding source count: ${requireInteger(snapshot.grounding_source_count, 'snapshot.grounding_source_count')}`,
    `Has authoritative primary source: ${formatBoolean(snapshot.has_authoritative_primary_source, 'snapshot.has_authoritative_primary_source')}`,
    '',
    'Syllabus questions:',
    formatList(syllabusQuestions),
    '',
    'Selected theory source spans or excerpt:',
    requireString(snapshot.theory_excerpt, 'snapshot.theory_excerpt'),
    '',
    formatStudyCardSemanticRules(topicId, targetDifficulty, { includeMinimum: true }),
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
  const compiledMiniGameSpecs = optionalRecordArray(snapshot.compiled_mini_game_specs, 'snapshot.compiled_mini_game_specs');
  const compiledSpecBlock = compiledMiniGameSpecs.length === 0
    ? []
    : [
      '',
      'Compiled mini-game specs selected by the backend card plan:',
      formatCompiledMiniGameSpecRecords(compiledMiniGameSpecs),
    ];
  const system = [
    'You are an Abyss Engine Topic Content prompt module.',
    `Create playable ${expectedGameType} mini-game cards and return only JSON matching the ${pipelineKind} schema.`,
    '',
    `Subject id: ${requireString(snapshot.subject_id, 'snapshot.subject_id')}`,
    `Topic id: ${requireString(snapshot.topic_id, 'snapshot.topic_id')}`,
    `Expected gameType: ${expectedGameType}`,
    `Default target difficulty: ${requireInteger(snapshot.target_difficulty, 'snapshot.target_difficulty')}`,
    `Grounding source count: ${requireInteger(snapshot.grounding_source_count, 'snapshot.grounding_source_count')}`,
    `Grounding source selection: ${optionalString(snapshot.grounding_source_selection, 'snapshot.grounding_source_selection') ?? 'legacy'}`,
    `Has authoritative primary source: ${formatBoolean(snapshot.has_authoritative_primary_source, 'snapshot.has_authoritative_primary_source')}`,
    ...compiledSpecBlock,
    '',
    'Syllabus questions:',
    formatList(syllabusQuestions),
    '',
    'Selected theory source spans or excerpt:',
    requireString(snapshot.theory_excerpt, 'snapshot.theory_excerpt'),
    '',
    'Backend materialization deterministically assigns persisted card IDs; any model-generated id is temporary and will be ignored.',
    `Every card must have type MINI_GAME, content.gameType ${expectedGameType}, and topicId equal to the snapshot topic id.`,
    compiledMiniGameSpecs.length > 0
      ? 'Generate cards only for the compiled mini-game specs above. Each card difficulty must match its spec difficulty, and content must satisfy that spec prompt using only the selected source spans.'
      : 'Every generated card difficulty should match the default target difficulty.',
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
  const topicId = requireString(snapshot.topic_id, 'snapshot.topic_id');
  const difficulty = requireInteger(snapshot.difficulty, 'snapshot.difficulty');
  const system = [
    'You are an Abyss Engine Topic Expansion prompt module.',
    'Create additional deck-compatible study cards for the next Crystal Level and return only JSON matching the topic-expansion-cards schema.',
    '',
    `Subject id: ${requireString(snapshot.subject_id, 'snapshot.subject_id')}`,
    `Topic id: ${topicId}`,
    `Next Crystal Level: ${requireInteger(snapshot.next_level, 'snapshot.next_level')}`,
    `Difficulty: ${difficulty}`,
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
    'Selected theory source spans or excerpt:',
    requireString(snapshot.theory_excerpt, 'snapshot.theory_excerpt'),
    '',
    formatStudyCardSemanticRules(topicId, difficulty, { includeMinimum: false }),
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
