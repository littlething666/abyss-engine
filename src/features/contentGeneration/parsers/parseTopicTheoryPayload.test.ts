import { describe, expect, it } from 'vitest';

import { FIRECRAWL_TOPIC_GROUNDING_POLICY } from '../grounding/groundingPolicy';
import { validateGroundingSources } from '../grounding/validateGroundingSources';
import { parseTopicTheoryPayload } from './parseTopicTheoryPayload';

const validPayload = {
  coreConcept: 'Core concept.',
  theory: '## Theory\nSubstantive content.',
  keyTakeaways: ['a', 'b', 'c', 'd'],
  coreQuestionsByDifficulty: {
    1: ['q1'],
    2: ['q2'],
    3: ['q3'],
    4: ['q4'],
  },
  miniGameAffordances: {
    categorySets: [
      {
        label: 'Kinds',
        categories: ['A', 'B', 'C'],
        candidateItems: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'],
      },
    ],
    orderedSequences: [{ label: 'Flow', steps: ['one', 'two', 'three'] }],
    connectionPairs: [
      {
        label: 'Terms',
        pairs: [
          { left: 'A', right: 'Alpha' },
          { left: 'B', right: 'Beta' },
          { left: 'C', right: 'Gamma' },
        ],
      },
    ],
  },
};

const validProviderMetadata = {
  usage: { server_tool_use: { web_search_requests: 1 } },
  annotations: [
    {
      type: 'url_citation',
      url_citation: {
        title: 'University source',
        url: 'https://example.edu/course',
      },
    },
    {
      type: 'url_citation',
      url_citation: {
        title: 'Official docs',
        url: 'https://docs.example.com/topic',
      },
    },
  ],
};

describe('parseTopicTheoryPayload', () => {
  it('requires difficulty 4 and validates annotation-derived grounding sources', () => {
    const result = parseTopicTheoryPayload(JSON.stringify(validPayload), {
      groundingPolicy: FIRECRAWL_TOPIC_GROUNDING_POLICY,
      providerMetadata: validProviderMetadata,
      retrievedAt: '2026-04-26T00:00:00.000Z',
      validateGroundingSources,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.coreQuestionsByDifficulty[4]).toEqual(['q4']);
      expect(result.data.groundingSources[0].trustLevel).toBe('high');
    }
  });

  it('fails when provider metadata reports zero web-search requests', () => {
    const result = parseTopicTheoryPayload(JSON.stringify(validPayload), {
      groundingPolicy: FIRECRAWL_TOPIC_GROUNDING_POLICY,
      providerMetadata: {
        ...validProviderMetadata,
        usage: { server_tool_use: { web_search_requests: 0 } },
      },
      validateGroundingSources,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('zero web-search requests');
    }
  });

  it('accepts annotation-backed grounding when provider omits explicit web-search usage counters', () => {
    const result = parseTopicTheoryPayload(JSON.stringify(validPayload), {
      groundingPolicy: FIRECRAWL_TOPIC_GROUNDING_POLICY,
      providerMetadata: {
        annotations: validProviderMetadata.annotations,
        usage: { prompt_tokens: 123, completion_tokens: 456, total_tokens: 579 },
      },
      retrievedAt: '2026-04-26T00:00:00.000Z',
      validateGroundingSources,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.groundingSources).toHaveLength(2);
    }
  });

  it('fails when grounded generation has no URL citation annotations', () => {
    const result = parseTopicTheoryPayload(JSON.stringify(validPayload), {
      groundingPolicy: FIRECRAWL_TOPIC_GROUNDING_POLICY,
      providerMetadata: { usage: { server_tool_use: { web_search_requests: 1 } } },
      validateGroundingSources,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('accepted grounding sources');
    }
  });
});
