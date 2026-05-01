import { extractJsonString, logJsonParseError } from '@/lib/llmResponseText';
import type { CoreQuestionsByDifficulty } from '@/types/core';
import type { GroundingSearchPolicy, GroundingSource } from '@/types/grounding';
import { z } from 'zod';

const syllabusKeysSchema = z.object({
  '1': z.array(z.string()).min(1),
  '2': z.array(z.string()).min(1),
  '3': z.array(z.string()).min(1),
  '4': z.array(z.string()).min(1),
});

const theoryContentPayloadSchema = z
  .object({
    coreConcept: z.string().min(1),
    theory: z.string().min(1),
    keyTakeaways: z.array(z.string()).min(4),
    coreQuestionsByDifficulty: syllabusKeysSchema,
  })
  .strict();

function extractGroundingSourcesFromProviderMetadata(
  providerMetadata: Record<string, unknown> | undefined,
  retrievedAt: string,
): GroundingSource[] {
  const annotations = providerMetadata?.annotations;
  if (!Array.isArray(annotations)) return [];

  const seenUrls = new Set<string>();
  const sources: GroundingSource[] = [];
  for (const annotation of annotations) {
    if (!annotation || typeof annotation !== 'object') continue;
    const record = annotation as { type?: unknown; url_citation?: unknown };
    if (record.type !== 'url_citation' || !record.url_citation || typeof record.url_citation !== 'object') {
      continue;
    }

    const citation = record.url_citation as { title?: unknown; url?: unknown };
    if (typeof citation.url !== 'string' || seenUrls.has(citation.url)) continue;
    seenUrls.add(citation.url);
    sources.push({
      title: typeof citation.title === 'string' ? citation.title : '',
      url: citation.url,
      retrievedAt,
      trustLevel: 'medium',
    });
  }

  return sources;
}

export type ParsedTopicTheoryContentPayload = {
  coreConcept: string;
  theory: string;
  keyTakeaways: string[];
  coreQuestionsByDifficulty: CoreQuestionsByDifficulty;
  groundingSources: GroundingSource[];
};

export type ParseTopicTheoryContentResult =
  | { ok: true; data: ParsedTopicTheoryContentPayload }
  | { ok: false; error: string };

export function parseTopicTheoryContentPayload(
  raw: string,
  options?: {
    groundingPolicy?: GroundingSearchPolicy;
    providerMetadata?: Record<string, unknown>;
    retrievedAt?: string;
    validateGroundingSources?: (params: {
      sources: GroundingSource[];
      policy: GroundingSearchPolicy;
      providerMetadata?: Record<string, unknown>;
    }) => {
      acceptedSources: GroundingSource[];
      rejectedSources: unknown[];
      usage: unknown;
      errors: string[];
    };
  },
): ParseTopicTheoryContentResult {
  const jsonStr = extractJsonString(raw);
  if (!jsonStr) {
    return { ok: false, error: 'No JSON found in assistant response' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr) as unknown;
  } catch (e) {
    logJsonParseError('parseTopicTheoryContentPayload', e, jsonStr);
    return { ok: false, error: 'Assistant response is not valid JSON' };
  }

  const result = theoryContentPayloadSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.length ? issue.path.join('.') : 'root';
    return { ok: false, error: `Invalid theory payload at ${path}: ${issue?.message ?? 'unknown'}` };
  }

  const d = result.data.coreQuestionsByDifficulty;
  const coreQuestionsByDifficulty: CoreQuestionsByDifficulty = {
    1: d['1'],
    2: d['2'],
    3: d['3'],
    4: d['4'],
  };
  let groundingSources = extractGroundingSourcesFromProviderMetadata(
    options?.providerMetadata,
    options?.retrievedAt ?? new Date().toISOString(),
  );
  if (options?.groundingPolicy) {
    const validation = options.validateGroundingSources?.({
      sources: groundingSources,
      policy: options.groundingPolicy,
      providerMetadata: options.providerMetadata,
    });
    if (validation && validation.errors.length > 0) {
      return { ok: false, error: `Invalid grounding sources: ${validation.errors.join('; ')}` };
    }
    if (validation) {
      groundingSources = validation.acceptedSources;
    }
  }

  return {
    ok: true,
    data: {
      coreConcept: result.data.coreConcept,
      theory: result.data.theory,
      keyTakeaways: result.data.keyTakeaways,
      coreQuestionsByDifficulty,
      groundingSources,
    },
  };
}
