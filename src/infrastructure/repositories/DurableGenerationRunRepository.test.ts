/**
 * DurableGenerationRunRepository utility tests — Phase 3.6 P1 #2.
 *
 * Tests the `mapWorkerJobStatus` strict transport decoder — unknown
 * job statuses must throw, not silently default to `queued`.
 */

import { describe, expect, it } from 'vitest';
import { mapWorkerJobStatus } from './DurableGenerationRunRepository';

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
