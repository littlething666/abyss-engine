import type {
  GeneratedCardQualityReport,
  GeneratedCardValidationFailure,
} from '@/types/contentQuality';
import type { GroundingSource } from '@/types/grounding';

export function computeQualityReport(params: {
  emittedCount: number;
  validCount: number;
  duplicateConceptCount: number;
  groundingSources?: GroundingSource[];
  failures: GeneratedCardValidationFailure[];
}): GeneratedCardQualityReport {
  const invalidCount = Math.max(0, params.emittedCount - params.validCount);
  return {
    emittedCount: params.emittedCount,
    validCount: params.validCount,
    invalidCount,
    invalidRatio: params.emittedCount > 0 ? invalidCount / params.emittedCount : 1,
    duplicateConceptCount: params.duplicateConceptCount,
    duplicateConceptRatio: params.validCount > 0 ? params.duplicateConceptCount / params.validCount : 0,
    groundingSourceCount: params.groundingSources?.length ?? 0,
    hasHighTrustGroundingSource: params.groundingSources?.some((source) => source.trustLevel === 'high') ?? false,
    failures: params.failures,
  };
}
