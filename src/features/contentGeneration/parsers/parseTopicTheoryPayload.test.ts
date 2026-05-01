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
        categories: [
          { id: 'cat-a', label: 'A' },
          { id: 'cat-b', label: 'B' },
          { id: 'cat-c', label: 'C' },
        ],
        items: [
          { id: 'it-0', label: 'a1', categoryId: 'cat-a' },
          { id: 'it-1', label: 'a2', categoryId: 'cat-a' },
          { id: 'it-2', label: 'b1', categoryId: 'cat-b' },
          { id: 'it-3', label: 'b2', categoryId: 'cat-b' },
          { id: 'it-4', label: 'c1', categoryId: 'cat-c' },
          { id: 'it-5', label: 'c2', categoryId: 'cat-c' },
        ],
      },
    ],
    orderedSequences: [
      {
        label: 'Flow',
        items: [
          { id: 's-0', label: 'one', correctPosition: 0 },
          { id: 's-1', label: 'two', correctPosition: 1 },
          { id: 's-2', label: 'three', correctPosition: 2 },
        ],
      },
    ],
    connectionPairs: [
      {
        label: 'Terms',
        pairs: [
          { id: 'p-0', left: 'A', right: 'Alpha' },
          { id: 'p-1', left: 'B', right: 'Beta' },
          { id: 'p-2', left: 'C', right: 'Gamma' },
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
  it('migrates legacy miniGameAffordances shapes before validation', () => {
    const legacy = {
      ...validPayload,
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
    const result = parseTopicTheoryPayload(JSON.stringify(legacy), {
      groundingPolicy: FIRECRAWL_TOPIC_GROUNDING_POLICY,
      providerMetadata: validProviderMetadata,
      retrievedAt: '2026-04-26T00:00:00.000Z',
      validateGroundingSources,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.miniGameAffordances.categorySets[0]?.items).toHaveLength(6);
      expect(result.data.miniGameAffordances.orderedSequences[0]?.items).toHaveLength(3);
      expect(result.data.miniGameAffordances.connectionPairs[0]?.pairs[0]).toMatchObject({
        id: 'pair-0',
        left: 'A',
        right: 'Alpha',
      });
    }
  });

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
