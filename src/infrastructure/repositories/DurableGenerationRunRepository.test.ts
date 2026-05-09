/**
 * DurableGenerationRunRepository utility tests — Phase 3.6 P1 #2.
 *
 * Tests the `mapWorkerJobStatus` strict transport decoder — unknown
 * job statuses must throw, not silently default to `queued`.
 */

import { describe, expect, it, vi } from 'vitest';
import { DurableGenerationRunRepository, mapWorkerJobStatus } from './DurableGenerationRunRepository';
import type { ApiClient } from '../http/apiClient';

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

describe('DurableGenerationRunRepository.submitRun', () => {
  it('posts direct generation intents as { kind, intent } without snapshots or policy fields', async () => {
    const post = vi.fn().mockResolvedValue({ runId: 'run-1' });
    const repo = new DurableGenerationRunRepository({
      deviceId: 'dev-1',
      http: { baseUrl: 'https://worker.test', post } as unknown as ApiClient,
    });

    await repo.submitRun(
      { kind: 'topic-content', subjectId: 'math', topicId: 'limits', stage: 'theory' },
      'idem-1',
    );

    expect(post).toHaveBeenCalledWith(
      '/v1/runs',
      {
        kind: 'topic-content',
        intent: { subjectId: 'math', topicId: 'limits', stage: 'theory' },
      },
      { headers: { 'idempotency-key': 'idem-1' } },
    );
    expect(JSON.stringify(post.mock.calls[0]![1])).not.toContain('snapshot');
    expect(JSON.stringify(post.mock.calls[0]![1])).not.toContain('model');
  });

  it('adds deterministic supersession headers for topic expansion intents', async () => {
    const post = vi.fn().mockResolvedValue({ runId: 'run-1' });
    const repo = new DurableGenerationRunRepository({
      deviceId: 'dev-1',
      http: { baseUrl: 'https://worker.test', post } as unknown as ApiClient,
    });

    await repo.submitRun(
      { kind: 'topic-expansion', subjectId: 'math', topicId: 'limits', nextLevel: 2 },
      'idem-2',
    );

    expect(post).toHaveBeenCalledWith(
      '/v1/runs',
      {
        kind: 'topic-expansion',
        intent: { subjectId: 'math', topicId: 'limits', nextLevel: 2 },
      },
      {
        headers: {
          'idempotency-key': 'idem-2',
          'supersedes-key': 'te-supersedes:math:limits',
        },
      },
    );
  });
});