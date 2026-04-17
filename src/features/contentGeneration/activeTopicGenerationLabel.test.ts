import { describe, expect, it } from 'vitest';

import type { ContentGenerationJob } from '@/types/contentGeneration';

import { activeTopicContentGenerationLabel, activeTopicGenerationLabel } from './activeTopicGenerationLabel';

function job(partial: Partial<ContentGenerationJob> & Pick<ContentGenerationJob, 'id' | 'kind'>): ContentGenerationJob {
  return {
    id: partial.id,
    kind: partial.kind,
    pipelineId: partial.pipelineId ?? null,
    status: partial.status ?? 'streaming',
    label: partial.label ?? 'L',
    subjectId: partial.subjectId ?? 's',
    topicId: partial.topicId ?? 't',
    createdAt: partial.createdAt ?? 0,
    startedAt: partial.startedAt ?? null,
    finishedAt: partial.finishedAt ?? null,
    inputMessages: partial.inputMessages ?? null,
    rawOutput: partial.rawOutput ?? '',
    reasoningText: partial.reasoningText ?? null,
    error: partial.error ?? null,
    parseError: partial.parseError ?? null,
    retryOf: partial.retryOf ?? null,
    metadata: partial.metadata ?? null,
  };
}

describe('activeTopicGenerationLabel', () => {
  it('returns label for any in-flight job for the topic ref', () => {
    const jobs = {
      a: job({ id: 'a', kind: 'crystal-trial', status: 'streaming', subjectId: 's', topicId: 't' }),
    };
    expect(activeTopicGenerationLabel({ jobs }, 's', 't')).toBe('L');
  });
});

describe('activeTopicContentGenerationLabel', () => {
  it('ignores crystal-trial jobs so trial pregeneration does not block topic-content HUD', () => {
    const jobs = {
      a: job({ id: 'a', kind: 'crystal-trial', status: 'streaming', subjectId: 's', topicId: 't' }),
    };
    expect(activeTopicContentGenerationLabel({ jobs }, 's', 't')).toBeNull();
  });

  it('returns label for non-trial in-flight jobs', () => {
    const jobs = {
      a: job({
        id: 'a',
        kind: 'topic-theory',
        status: 'parsing',
        subjectId: 's',
        topicId: 't',
        label: 'Theory',
      }),
    };
    expect(activeTopicContentGenerationLabel({ jobs }, 's', 't')).toBe('Theory');
  });
});
