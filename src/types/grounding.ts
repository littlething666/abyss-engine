export type GroundingSearchEngine = 'firecrawl' | 'exa' | 'parallel';

export type GroundingSourceTrustLevel = 'high' | 'medium' | 'rejected';

export interface GroundingSearchPolicy {
  engine: GroundingSearchEngine;
  maxResults: number;
  maxTotalResults: number;
  requireWebSearch: boolean;
  minAcceptedSources: number;
  requireHighTrustSource: boolean;
  rejectedDomains: readonly string[];
}

export interface GroundingUsage {
  webSearchRequests: number;
}

export interface GroundingSource {
  title: string;
  url: string;
  retrievedAt: string;
  publisher?: string;
  trustLevel: GroundingSourceTrustLevel;
}

export interface RejectedGroundingSource {
  title?: string;
  url?: string;
  reason: string;
}
