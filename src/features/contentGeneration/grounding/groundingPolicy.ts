import type { GroundingSearchPolicy } from '@/types/grounding';
import type { OpenRouterWebSearchTool } from '@/types/llm';

/**
 * Target policy when topic theory is grounded via backend search (e.g. Firecrawl) and/or
 * restored provider citations. Not used for the interim ungrounded theory stage.
 */
export const FIRECRAWL_TOPIC_GROUNDING_POLICY: GroundingSearchPolicy = {
  engine: 'firecrawl',
  maxResults: 2,
  maxTotalResults: 4,
  requireWebSearch: true,
  minAcceptedSources: 2,
  requireAuthoritativePrimarySource: false,
  authoritativePrimarySourceDomains: [
    'developer.mozilla.org',
    'docs.python.org',
    'docs.oracle.com',
    'learn.microsoft.com',
    'react.dev',
    'nextjs.org',
    'nodejs.org',
    'typescriptlang.org',
    'go.dev',
    'rust-lang.org',
    'doc.rust-lang.org',
    'kubernetes.io',
    'docs.docker.com',
    'postgresql.org',
    'sqlite.org',
    'mysql.com',
    'w3.org',
    'whatwg.org',
    'ietf.org',
    'rfc-editor.org',
    'iso.org',
    'ecma-international.org',
    'tc39.es',
    'opengroup.org',
  ],
  rejectedDomains: [],
};

/**
 * Topic theory stage while OpenRouter `openrouter:web_search` is disabled (upstream 500 /
 * server-tool failures). Same trust-domain lists as {@link FIRECRAWL_TOPIC_GROUNDING_POLICY};
 * validation allows zero accepted sources and does not require web-search usage metadata.
 * Replace with backend-grounded flow + {@link FIRECRAWL_TOPIC_GROUNDING_POLICY} when ready.
 */
export const TOPIC_THEORY_INTERIM_UNGROUNDED_POLICY: GroundingSearchPolicy = {
  ...FIRECRAWL_TOPIC_GROUNDING_POLICY,
  requireWebSearch: false,
  minAcceptedSources: 0,
};

/**
 * @deprecated OpenRouter server-side web search is broken/unreliable; do not attach
 * `openrouter:web_search` to chat completions. Backend Firecrawl (or equivalent) will
 * replace this path. Kept only for tests and typed references during migration.
 */
export function buildOpenRouterWebSearchTools(
  policy: GroundingSearchPolicy,
): OpenRouterWebSearchTool[] {
  return [
    {
      type: 'openrouter:web_search',
      parameters: {
        engine: policy.engine,
        max_results: policy.maxResults,
        max_total_results: policy.maxTotalResults,
      },
    },
  ];
}
