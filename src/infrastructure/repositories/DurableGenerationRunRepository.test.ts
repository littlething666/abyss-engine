/**
 * DurableGenerationRunRepository utility tests — Phase 3.6 P1 #2.
 *
 * Tests the `mapWorkerJobStatus` strict transport decoder — unknown
 * job statuses must throw, not silently default to `queued`.
 */

import { describe, expect, it } from 'vitest';
import { mapWorkerJobStatus, runInputToSubmitIntent } from './DurableGenerationRunRepository';
import type { RunInput } from '@/types/repository';

describe('mapWorkerJobStatus (strict transport decoding)', () => {
  it('maps known statuses correctly', () => {
    expect(mapWorkerJobStatus('queued')).toBe('queued');
    expect(mapWorkerJobStatus('streaming')).toBe('streaming');
    expect(mapWorkerJobStatus('generating_stage')).toBe('streaming');
    expect(mapWorkerJobStatus('completed')).toBe('completed');
    expect(mapWorkerJobStatus('ready')).toBe('completed');
    expect(mapWorkerJobStatus('failed')).toBe('failed');
    expect(mapWorkerJobStatus('failed_final')).toBe('failed');
    expect(mapWorkerJobStatus('aborted')).toBe('aborted');
    expect(mapWorkerJobStatus('cancelled')).toBe('aborted');
  });

  it('throws on unknown job status (strict transport decoding)', () => {
    expect(() => mapWorkerJobStatus('unknown_status')).toThrow(
      /unknown job status/,
    );
    expect(() => mapWorkerJobStatus('')).toThrow(/unknown job status/);
    expect(() => mapWorkerJobStatus('IN_PROGRESS')).toThrow(
      /unknown job status/,
    );
  });
});

describe('runInputToSubmitIntent', () => {
  it('omits client-built snapshots and generation policy fields for durable submit', () => {
    const input: Extract<RunInput, { pipelineKind: 'topic-expansion' }> = {
      pipelineKind: 'topic-expansion',
      subjectId: 'math',
      topicId: 'limits',
      nextLevel: 2,
      snapshot: {
        snapshot_version: 1,
        pipeline_kind: 'topic-expansion-cards',
        schema_version: 1,
        prompt_template_version: 'v1',
        model_id: 'client-owned-model',
        captured_at: '2026-05-07T00:00:00.000Z',
        subject_id: 'math',
        topic_id: 'limits',
        next_level: 2,
        difficulty: 3,
        theory_excerpt: 'limits theory',
        syllabus_questions: ['What is a limit?'],
        existing_card_ids: ['card-1'],
        existing_concept_stems: ['limit'],
        grounding_source_count: 0,
      },
    };

    expect(runInputToSubmitIntent(input)).toEqual({
      subjectId: 'math',
      topicId: 'limits',
      nextLevel: 2,
    });
  });

  it('maps subject graph topics to checklist and strategy brief intent', () => {
    const input: Extract<RunInput, { pipelineKind: 'subject-graph' }> = {
      pipelineKind: 'subject-graph',
      subjectId: 'math',
      stage: 'topics',
      snapshot: {
        snapshot_version: 1,
        pipeline_kind: 'subject-graph-topics',
        schema_version: 1,
        prompt_template_version: 'v1',
        model_id: 'client-owned-model',
        captured_at: '2026-05-07T00:00:00.000Z',
        subject_id: 'math',
        checklist: { topic_name: 'Calculus' },
        strategy_brief: {
          total_tiers: 4,
          topics_per_tier: 3,
          audience_brief: 'Beginner',
          domain_brief: 'Math',
          focus_constraints: '',
        },
      },
    };

    expect(runInputToSubmitIntent(input)).toEqual({
      subjectId: 'math',
      stage: 'topics',
      checklist: { topic_name: 'Calculus' },
      strategyBrief: {
        total_tiers: 4,
        topics_per_tier: 3,
        audience_brief: 'Beginner',
        domain_brief: 'Math',
        focus_constraints: '',
      },
    });
  });
});
