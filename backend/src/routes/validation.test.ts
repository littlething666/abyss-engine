import { describe, expect, it } from 'vitest';
import {
  validateArtifactReadInput,
  validateCrystalTrialReadInput,
  validateFailureStatsQuery,
  validateRetryBody,
  validateRunEventsReadInput,
  validateRunIdRouteInput,
  validateRunsListQuery,
  validateSubmitRunBody,
} from './validation';

describe('route validation seam', () => {
  it('validates backend-owned run submission intents and rejects snapshots', () => {
    expect(validateSubmitRunBody({ kind: 'topic-content', intent: { subjectId: 'math', topicId: 'limits' } })).toEqual({
      ok: true,
      value: { kind: 'topic-content', intent: { subjectId: 'math', topicId: 'limits' } },
    });

    const rejected = validateSubmitRunBody({ kind: 'topic-content', intent: {}, snapshot: {} });
    expect(rejected).toEqual({
      ok: false,
      failure: {
        code: 'parse:json-mode-violation',
        message: 'snapshot is not accepted; POST /v1/runs requires { kind, intent }',
      },
    });
  });

  it('validates run list filters before they reach D1 query construction', () => {
    expect(validateRunsListQuery({ status: 'recent', kind: 'crystal-trial', limit: '15' })).toEqual({
      ok: true,
      value: { status: 'recent', kind: 'crystal-trial', limit: 15 },
    });

    expect(validateRunsListQuery({ status: 'all', limit: '100' })).toEqual({
      ok: true,
      value: { status: 'all', limit: 100 },
    });

    const invalidStatus = validateRunsListQuery({ status: 'ready' });
    expect(invalidStatus.ok).toBe(false);
    if (!invalidStatus.ok) {
      expect(invalidStatus.failure.code).toBe('parse:invalid-query');
      expect(invalidStatus.failure.message).toContain('status');
    }

    const invalidLimit = validateRunsListQuery({ limit: '501' });
    expect(invalidLimit.ok).toBe(false);
    if (!invalidLimit.ok) {
      expect(invalidLimit.failure.message).toContain('limit');
    }
  });

  it('validates retry bodies without silently dropping malformed fields', () => {
    expect(validateRetryBody({ stage: 'theory', jobId: 'job-1' })).toEqual({
      ok: true,
      value: { stage: 'theory', jobId: 'job-1' },
    });

    const nonObject = validateRetryBody(null);
    expect(nonObject).toEqual({
      ok: false,
      failure: { code: 'parse:json-mode-violation', message: 'retry body must be an object when provided' },
    });

    const wrongType = validateRetryBody({ stage: 7 });
    expect(wrongType.ok).toBe(false);
    if (!wrongType.ok) {
      expect(wrongType.failure.message).toContain('stage');
    }
  });

  it('validates run, event-stream, artifact, and stats route inputs before repositories run', () => {
    expect(validateRunIdRouteInput({ runId: 'run-1' })).toEqual({
      ok: true,
      value: { runId: 'run-1' },
    });

    const badRunId = validateRunIdRouteInput({ runId: ' run-1' });
    expect(badRunId.ok).toBe(false);
    if (!badRunId.ok) {
      expect(badRunId.failure.code).toBe('parse:invalid-route-input');
      expect(badRunId.failure.message).toContain('runId');
    }

    expect(validateRunEventsReadInput({ runId: 'run-1', lastEventId: '3' })).toEqual({
      ok: true,
      value: { runId: 'run-1', lastSeq: 3 },
    });
    expect(validateRunEventsReadInput({ runId: 'run-1', lastSeq: '0' })).toEqual({
      ok: true,
      value: { runId: 'run-1', lastSeq: 0 },
    });

    const mismatchedCursor = validateRunEventsReadInput({ runId: 'run-1', lastEventId: '3', lastSeq: '2' });
    expect(mismatchedCursor.ok).toBe(false);
    if (!mismatchedCursor.ok) {
      expect(mismatchedCursor.failure.message).toContain('lastSeq');
    }

    expect(validateArtifactReadInput({ artifactId: 'artifact-1' })).toEqual({
      ok: true,
      value: { artifactId: 'artifact-1' },
    });

    expect(validateFailureStatsQuery({ days: '30', pipelineKind: 'topic-content', model: 'model-a' })).toEqual({
      ok: true,
      value: { days: 30, pipelineKind: 'topic-content', model: 'model-a', failureCode: undefined },
    });

    const invalidDays = validateFailureStatsQuery({ days: '91' });
    expect(invalidDays.ok).toBe(false);
    if (!invalidDays.ok) {
      expect(invalidDays.failure.code).toBe('parse:invalid-query');
      expect(invalidDays.failure.message).toContain('days');
    }
  });

  it('validates Crystal Trial read params and query as one boundary input', () => {
    expect(validateCrystalTrialReadInput({
      subjectId: 'math',
      topicId: 'limits',
      targetLevel: '3',
      cardPoolHash: 'pool-1',
    })).toEqual({
      ok: true,
      value: { subjectId: 'math', topicId: 'limits', targetLevel: 3, cardPoolHash: 'pool-1' },
    });

    const missingHash = validateCrystalTrialReadInput({
      subjectId: 'math',
      topicId: 'limits',
      targetLevel: '3',
      cardPoolHash: undefined,
    });
    expect(missingHash.ok).toBe(false);
    if (!missingHash.ok) {
      expect(missingHash.failure.code).toBe('parse:invalid-route-input');
      expect(missingHash.failure.message).toContain('cardPoolHash');
    }
  });
});
