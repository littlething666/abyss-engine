import type { GroundingSource } from '@/types/grounding';

/**
 * Allowlisted snapshot stored on grounded card jobs before parse/streaming,
 * so failure debug bundles can read `metadata.grounding` without fetching sources later.
 */
export function buildGroundingJobMetadataSnapshot(
  groundingSources: GroundingSource[],
): { grounding: { sourceCount: number; hasAuthoritativePrimarySource: boolean; sources: GroundingSource[] } } {
  return {
    grounding: {
      sourceCount: groundingSources.length,
      hasAuthoritativePrimarySource: groundingSources.some((s) => s.trustLevel === 'high'),
      sources: groundingSources,
    },
  };
}
