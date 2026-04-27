import type { GroundingSearchPolicy } from '@/types/grounding';
import type { OpenRouterWebSearchTool } from '@/types/llm';

export const FIRECRAWL_TOPIC_GROUNDING_POLICY: GroundingSearchPolicy = {
  engine: 'firecrawl',
  maxResults: 6,
  maxTotalResults: 8,
  requireWebSearch: true,
  minAcceptedSources: 2,
  requireHighTrustSource: true,
  rejectedDomains: [
    'reddit.com',
    'quora.com',
    'stackoverflow.com',
    'twitter.com',
    'x.com',
    'tiktok.com',
    'youtube.com',
    'medium.com',
    'substack.com',
    'coursehero.com',
    'chegg.com',
    'brainly.com',
  ],
};

export function buildOpenRouterWebSearchTools(
  policy: GroundingSearchPolicy,
): OpenRouterWebSearchTool[] {
  return [
    {
      type: 'openrouter:web_search',
      engine: policy.engine,
      max_results: policy.maxResults,
      max_total_results: policy.maxTotalResults,
    },
  ];
}
