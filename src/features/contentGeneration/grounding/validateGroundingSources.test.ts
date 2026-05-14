import { describe, expect, it } from 'vitest';

import type { GroundingSearchPolicy } from '@/types/grounding';

import { FIRECRAWL_TOPIC_GROUNDING_POLICY, TOPIC_THEORY_INTERIM_UNGROUNDED_POLICY } from './groundingPolicy';
import { validateGroundingSources } from './validateGroundingSources';

const providerMetadata = {
  usage: { server_tool_use: { web_search_requests: 1 } },
};

function validateSingleSource(url: string, policyOverrides?: Partial<GroundingSearchPolicy>) {
  return validateGroundingSources({
    sources: [
      {
        title: 'Source',
        url,
        retrievedAt: '2026-04-26T00:00:00.000Z',
        trustLevel: 'medium',
      },
    ],
    policy: {
      ...FIRECRAWL_TOPIC_GROUNDING_POLICY,
      minAcceptedSources: 1,
      ...policyOverrides,
    },
    providerMetadata,
  });
}

describe('validateGroundingSources', () => {
  it.each([
    ['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript'],
    ['Python docs', 'https://docs.python.org/3/tutorial/index.html'],
    ['React docs', 'https://react.dev/reference/react'],
    ['W3C standard', 'https://www.w3.org/TR/wai-aria-1.2/'],
    ['IETF standard', 'https://www.ietf.org/archive/id/draft-example-00.html'],
    ['RFC Editor standard', 'https://www.rfc-editor.org/rfc/rfc9110'],
    ['TC39 proposal', 'https://tc39.es/ecma262/'],
  ])('classifies %s as an authoritative primary source', (_label, url) => {
    const result = validateSingleSource(url);

    expect(result.errors).toEqual([]);
    expect(result.acceptedSources).toHaveLength(1);
    expect(result.acceptedSources[0]?.trustLevel).toBe('high');
  });

  it('does not promote generic docs-shaped hosts to authoritative primary sources', () => {
    const result = validateSingleSource('https://docs.random-blog.com/topic', {
      requireAuthoritativePrimarySource: true,
    });

    expect(result.acceptedSources).toHaveLength(1);
    expect(result.acceptedSources[0]?.trustLevel).toBe('medium');
    expect(result.errors).toContain('At least one authoritative primary source is required');
  });

  it('accepts empty sources with interim ungrounded policy and no provider usage', () => {
    const result = validateGroundingSources({
      sources: [],
      policy: TOPIC_THEORY_INTERIM_UNGROUNDED_POLICY,
      providerMetadata: {},
    });
    expect(result.errors).toEqual([]);
    expect(result.acceptedSources).toEqual([]);
  });

  it('accepts reddit and similar hosts when rejectedDomains is empty on the policy', () => {
    const result = validateSingleSource('https://www.reddit.com/r/poker/comments/example');

    expect(result.rejectedSources).toHaveLength(0);
    expect(result.acceptedSources).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });
});
