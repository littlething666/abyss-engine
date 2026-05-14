import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildCrystalTrialMessages,
  buildSubjectGraphEdgesMessages,
  buildSubjectGraphTopicsMessages,
  buildTopicCardPlanMessages,
  buildTopicConceptPlanMessages,
  buildTopicExpansionMessages,
  buildTopicMiniGameContentMessages,
  buildTopicMiniGameMessages,
  buildTopicStudyCardsMessages,
  buildTopicTheoryMessages,
} from './generationPrompts';
import { SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE } from '../contracts/generationContracts';

const base = {
  snapshot_version: 1,
  schema_version: 1,
  prompt_template_version: 'v1',
  model_id: 'model/backend',
  captured_at: '2026-05-07T00:00:00.000Z',
} as const;

describe('backend generation prompt modules', () => {
  it('builds Subject Graph Generation Stage A messages from intent-expanded snapshot fields', () => {
    const messages = buildSubjectGraphTopicsMessages({
      ...base,
      pipeline_kind: 'subject-graph-topics',
      subject_id: 'linear-algebra',
      checklist: { topic_name: 'Linear Algebra', study_goal: 'proof fluency' },
      strategy_brief: {
        total_tiers: 3,
        topics_per_tier: 4,
        audience_brief: 'self-taught programmer',
        domain_brief: 'vectors and matrices',
        focus_constraints: 'emphasize geometry',
      },
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain('Total topics required: 12');
    expect(messages[0].content).toContain('vectors and matrices');
    expect(messages[0].content).toContain('Allowed topic iconName values:');
    expect(messages[0].content).toContain('chart-line');
    expect(messages[1].content).toContain('emphasize geometry');
  });

  it('builds Stage B prerequisite-edge messages from the authoritative Stage A lattice', () => {
    const messages = buildSubjectGraphEdgesMessages(
      {
        ...base,
        pipeline_kind: 'subject-graph-edges',
        subject_id: 'linear-algebra',
        lattice_artifact_content_hash: 'sha256:lattice',
      },
      [
        { topicId: 'vectors', title: 'Vectors', tier: 1, learningObjective: 'Use vector operations' },
        { topicId: 'bases', title: 'Bases', tier: 2, learningObjective: 'Change bases' },
      ],
    );

    expect(messages[0].content).toContain('sha256:lattice');
    expect(messages[0].content).toContain('vectors | tier 1 | Vectors');
    expect(messages[0].content).toContain('bases | tier 2 | Bases');
  });

  it('fails Stage B prompt construction when the lattice is unavailable', () => {
    expect(() => buildSubjectGraphEdgesMessages({
      ...base,
      pipeline_kind: 'subject-graph-edges',
      subject_id: 'linear-algebra',
      lattice_artifact_content_hash: 'sha256:lattice',
    }, [])).toThrow('requires the Stage A Topic Lattice topics');
  });

  it('builds topic concept-plan and card-plan messages with explicit sourceSpanId grounding', () => {
    const conceptPlan = buildTopicConceptPlanMessages({
      ...base,
      pipeline_kind: 'topic-concept-plan',
      subject_id: 'math',
      topic_id: 'limits',
      topic_title: 'Limits',
      learning_objective: 'Explain limits as approach behavior.',
      source_spans: [
        { sourceSpanId: 'span-core', kind: 'core-concept', index: 0, text: 'Limits describe approach behavior.' },
        { sourceSpanId: 'span-question', kind: 'syllabus-question', index: 0, difficulty: 2, text: 'How do one-sided limits compare?' },
      ],
      syllabus_questions: ['How do one-sided limits compare?'],
      target_difficulties: [1, 2],
    });

    expect(conceptPlan[0].content).toContain('topic-concept-plan schema');
    expect(conceptPlan[0].content).toContain('[span-core | core-concept] Limits describe approach behavior.');
    expect(conceptPlan[0].content).toContain('[span-question | syllabus-question difficulty 2] How do one-sided limits compare?');
    expect(conceptPlan[0].content).toContain('sourceSpanIds must be a non-empty subset copied exactly');
    expect(conceptPlan[0].content).toContain('Do not emit conceptId');

    const cardPlan = buildTopicCardPlanMessages({
      ...base,
      pipeline_kind: 'topic-card-plan',
      subject_id: 'math',
      topic_id: 'limits',
      topic_title: 'Limits',
      learning_objective: 'Explain limits as approach behavior.',
      concepts: [
        {
          concept_id: 'concept_abc',
          concept_key: 'approach-behavior',
          title: 'Approach behavior',
          summary: 'Values near an input.',
          source_span_ids: ['span-core', 'span-question'],
          target_difficulties: [1, 2],
          priority: 1,
          source_spans: [
            { sourceSpanId: 'span-core', kind: 'core-concept', index: 0, text: 'Limits describe approach behavior.' },
            { sourceSpanId: 'span-question', kind: 'syllabus-question', index: 0, difficulty: 2, text: 'How do one-sided limits compare?' },
          ],
        },
      ],
      card_spec_target: 2,
      mini_game_spec_target: 1,
    });

    expect(cardPlan[0].content).toContain('topic-card-plan schema');
    expect(cardPlan[0].content).toContain('Concept 1: approach-behavior | Approach behavior');
    expect(cardPlan[0].content).toContain('Allowed sourceSpanIds for this concept: span-core, span-question');
    expect(cardPlan[0].content).toContain('sourceSpanIds for each spec must be a non-empty subset');
    expect(cardPlan[0].content).toContain('Do not emit cardSpecId, miniGameSpecId, conceptId');
  });

  it('builds Topic Content theory, study-card, and mini-game messages behind one backend seam', () => {
    const theory = buildTopicTheoryMessages({
      ...base,
      pipeline_kind: 'topic-theory',
      subject_id: 'math',
      topic_id: 'vectors',
      topic_title: 'Vectors',
      learning_objective: 'Represent magnitude and direction',
      content_brief: 'Prefer applied examples.',
    });
    const cards = buildTopicStudyCardsMessages({
      ...base,
      pipeline_kind: 'topic-study-cards',
      subject_id: 'math',
      topic_id: 'vectors',
      theory_excerpt: 'A vector has magnitude and direction.',
      syllabus_questions: ['What is a vector?'],
      target_difficulty: 1,
      grounding_source_count: 0,
      has_authoritative_primary_source: false,
    });
    const miniGame = buildTopicMiniGameMessages({
      ...base,
      pipeline_kind: 'topic-mini-game-sequence-build',
      subject_id: 'math',
      topic_id: 'vectors',
      theory_excerpt: 'A vector has magnitude and direction.',
      syllabus_questions: ['How are vectors added?'],
      target_difficulty: 1,
      grounding_source_count: 0,
      has_authoritative_primary_source: false,
    });

    expect(theory[0].content).toContain('Prefer applied examples.');
    expect(cards[0].content).toContain('A vector has magnitude and direction.');
    expect(miniGame[0].content).toContain('Expected gameType: SEQUENCE_BUILD');
    expect(miniGame[0].content).toContain('Grounding source selection: legacy');
  });

  it('includes compiled mini-game specs when broad mini-game prompts are plan-gated', () => {
    const miniGame = buildTopicMiniGameMessages({
      ...base,
      pipeline_kind: 'topic-mini-game-match-pairs',
      subject_id: 'math',
      topic_id: 'vectors',
      theory_excerpt: '[span-a | theory] Pair vector notation with meaning.',
      syllabus_questions: ['Which notation maps to which vector idea?'],
      target_difficulty: 1,
      grounding_source_count: 1,
      grounding_source_selection: 'compiled-mini-game-specs',
      has_authoritative_primary_source: false,
      compiled_mini_game_specs: [
        {
          mini_game_spec_id: 'mini_game_spec_backend_owned',
          concept_id: 'concept_backend_owned',
          concept_key: 'vector-notation',
          mini_game_key: 'notation-pairs',
          game_type: 'MATCH_PAIRS',
          difficulty: 3,
          prompt: 'Match vector notation to its geometric meaning.',
          source_span_ids: ['span-a'],
          learning_objective: 'Interpret vector notation.',
        },
      ],
    });

    const content = miniGame[0].content;
    expect(content).toContain('Compiled mini-game specs selected by the backend card plan:');
    expect(content).toContain('notation-pairs | mini_game_spec_backend_owned');
    expect(content).toContain('Difficulty: 3');
    expect(content).toContain('Match vector notation to its geometric meaning.');
    expect(content).toContain('Generate exactly one mini-game card for each compiled mini-game spec above, in the same order.');
    expect(content).toContain('Grounding source selection: compiled-mini-game-specs');
  });

  it('builds one-spec mini-game content prompts for per-mini-game fan-out', () => {
    const miniGame = buildTopicMiniGameContentMessages({
      ...base,
      pipeline_kind: 'topic-mini-game-content',
      subject_id: 'math',
      topic_id: 'vectors',
      theory_excerpt: '[span-a | theory] Pair vector notation with meaning.',
      syllabus_questions: ['Which notation maps to which vector idea?'],
      target_difficulty: 1,
      grounding_source_count: 1,
      grounding_source_selection: 'compiled-mini-game-spec',
      has_authoritative_primary_source: false,
      compiled_mini_game_specs: [
        {
          mini_game_spec_id: 'mini_game_spec_backend_owned',
          concept_id: 'concept_backend_owned',
          concept_key: 'vector-notation',
          mini_game_key: 'notation-pairs',
          game_type: 'MATCH_PAIRS',
          difficulty: 3,
          prompt: 'Match vector notation to its geometric meaning.',
          source_span_ids: ['span-a'],
        },
      ],
    });

    const content = miniGame[0].content;
    expect(content).toContain('topic-mini-game-content schema');
    expect(content).toContain('Expected gameType: MATCH_PAIRS');
    expect(content).toContain('notation-pairs | mini_game_spec_backend_owned');
    expect(content).toContain('difficulty equal to the compiled mini-game spec difficulty');
    expect(miniGame[1].content).toBe('Output only the JSON object with the card field.');
  });

  it('includes compiled study-card specs when broad study-card prompts are plan-guided', () => {
    const cards = buildTopicStudyCardsMessages({
      ...base,
      pipeline_kind: 'topic-study-cards',
      subject_id: 'math',
      topic_id: 'vectors',
      theory_excerpt: '[span-a | theory] A vector has magnitude and direction.',
      syllabus_questions: ['What is a vector?'],
      target_difficulty: 1,
      grounding_source_count: 1,
      grounding_source_selection: 'compiled-card-specs',
      has_authoritative_primary_source: false,
      compiled_study_card_specs: [
        {
          card_spec_id: 'card_spec_backend_owned',
          concept_id: 'concept_backend_owned',
          concept_key: 'vector-basics',
          card_key: 'vector-definition',
          card_type: 'FLASHCARD',
          difficulty: 2,
          prompt: 'Ask for the definition of a vector.',
          source_span_ids: ['span-a'],
          learning_objective: 'Define vectors.',
        },
      ],
    });

    const content = cards[0].content;
    expect(content).toContain('Compiled study-card specs selected by the backend card plan:');
    expect(content).toContain('vector-definition | card_spec_backend_owned');
    expect(content).toContain('Card type: FLASHCARD');
    expect(content).toContain('Difficulty: 2');
    expect(content).toContain('Ask for the definition of a vector.');
    expect(content).toContain('Every card.difficulty must match the difficulty of the compiled study-card spec it satisfies.');
    expect(content).toContain('Generate exactly one study card for each compiled study-card spec above, in the same order.');
    expect(content).toContain('Grounding source selection: compiled-card-specs');
  });

  it('documents topic study-card semantic count, type, and content-shape requirements', () => {
    const messages = buildTopicStudyCardsMessages({
      ...base,
      pipeline_kind: 'topic-study-cards',
      subject_id: 'math',
      topic_id: 'vectors',
      theory_excerpt: 'A vector has magnitude and direction.',
      syllabus_questions: ['What is a vector?'],
      target_difficulty: 2,
      grounding_source_count: 0,
      has_authoritative_primary_source: false,
    });

    const content = messages[0].content;
    expect(content).toContain(`at least ${SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE} deck-compatible`);
    expect(content).toContain('Allowed card.type values: FLASHCARD and MULTIPLE_CHOICE only.');
    expect(content).toContain('Do not generate CLOZE cards');
    expect(content).toContain('Backend materialization deterministically assigns persisted card IDs');
    expect(content).toContain('Every card object must include topicId, type, difficulty, and content.');
    expect(content).toContain('Every card.difficulty must equal 2.');
    expect(content).toContain('FLASHCARD content must contain non-empty string fields front and back.');
    expect(content).toContain('MULTIPLE_CHOICE content must contain exactly question, options, and correctAnswer.');
    expect(content).toContain('Do not use alternate content keys such as prompt, answer, term, definition, choices, correctOption, correctAnswers, explanation, or rationale.');
    expect(content).toContain('"content":{"front"');
    expect(content).toContain('"difficulty":2');
    expect(content).not.toContain('Create FLASHCARD, CLOZE, and MULTIPLE_CHOICE cards only');
  });

  it('builds Topic Expansion and Crystal Trial messages without frontend model policy fields', () => {
    const expansion = buildTopicExpansionMessages({
      ...base,
      pipeline_kind: 'topic-expansion-cards',
      subject_id: 'math',
      topic_id: 'vectors',
      next_level: 2,
      difficulty: 3,
      theory_excerpt: 'Vector spaces have bases.',
      syllabus_questions: ['Why do bases matter?'],
      existing_card_ids: ['card-1'],
      existing_concept_stems: ['vector basics'],
      grounding_source_count: 0,
    });
    const trial = buildCrystalTrialMessages({
      ...base,
      pipeline_kind: 'crystal-trial',
      subject_id: 'math',
      topic_id: 'vectors',
      current_level: 1,
      target_level: 2,
      card_pool_hash: 'sha256:pool',
      question_count: 5,
      content_brief: 'Use engineering scenarios.',
    });

    expect(expansion[0].content).toContain('Existing card ids');
    expect(expansion[0].content).toContain('vector basics');
    expect(expansion[0].content).toContain('FLASHCARD content must contain non-empty string fields front and back.');
    expect(expansion[0].content).toContain('MULTIPLE_CHOICE content must contain exactly question, options, and correctAnswer.');
    expect(expansion[0].content).not.toContain(`at least ${SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE} deck-compatible`);
    expect(trial[0].content).toContain('sha256:pool');
    expect(trial[0].content).toContain('Use engineering scenarios.');
  });
});

describe('backend workflow prompt boundary', () => {
  it('keeps durable workflow prompt construction behind backend prompt modules', () => {
    const workflowDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'workflows');
    const workflowSources = readdirSync(workflowDir)
      .filter((file) => file.endsWith('Workflow.ts'))
      .map((file) => readFileSync(join(workflowDir, file), 'utf8'));

    for (const source of workflowSources) {
      expect(source).not.toContain('const messages = [');
      expect(source).not.toContain('let messages = [');
      expect(source).not.toContain('messages = [');
    }
  });
});
