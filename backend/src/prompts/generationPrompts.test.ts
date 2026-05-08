import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildCrystalTrialMessages,
  buildSubjectGraphEdgesMessages,
  buildSubjectGraphTopicsMessages,
  buildTopicExpansionMessages,
  buildTopicMiniGameMessages,
  buildTopicStudyCardsMessages,
  buildTopicTheoryMessages,
} from './generationPrompts';

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
