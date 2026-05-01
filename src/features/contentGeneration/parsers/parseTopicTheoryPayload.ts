import { extractJsonString, logJsonParseError } from '@/lib/llmResponseText';
import type { CoreQuestionsByDifficulty } from '@/types/core';
import type { MiniGameAffordanceSet } from '@/types/contentQuality';
import type { GroundingSearchPolicy, GroundingSource } from '@/types/grounding';
import { z } from 'zod';

import { migrateMiniGameAffordancesInput } from './migrateMiniGameAffordancesInput';

const syllabusKeysSchema = z.object({
  '1': z.array(z.string()).min(1),
  '2': z.array(z.string()).min(1),
  '3': z.array(z.string()).min(1),
  '4': z.array(z.string()).min(1),
});

const categoryRowSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

const categorySetItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  categoryId: z.string().min(1),
});

const categorySetSchema = z
  .object({
    label: z.string().min(1),
    categories: z.array(categoryRowSchema).min(3),
    items: z.array(categorySetItemSchema).min(6),
  })
  .superRefine((val, ctx) => {
    const catIds = new Set(val.categories.map((c) => c.id));
    for (const it of val.items) {
      if (!catIds.has(it.categoryId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `item "${it.id}" references unknown categoryId "${it.categoryId}"`,
          path: ['items'],
        });
      }
    }
  });

const sequenceItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  correctPosition: z.number().int().min(0),
});

const orderedSequenceSchema = z
  .object({
    label: z.string().min(1),
    items: z.array(sequenceItemSchema).min(3),
  })
  .superRefine((val, ctx) => {
    const n = val.items.length;
    const positions = val.items.map((i) => i.correctPosition).sort((a, b) => a - b);
    if (positions.length !== n) return;
    for (let i = 0; i < n; i++) {
      if (positions[i] !== i) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SEQUENCE_BUILD items must use contiguous correctPosition values 0..n-1',
          path: ['items'],
        });
        return;
      }
    }
  });

const connectionPairSchema = z.object({
  id: z.string().min(1),
  left: z.string().min(1),
  right: z.string().min(1),
});

const connectionPairsSetSchema = z.object({
  label: z.string().min(1),
  pairs: z.array(connectionPairSchema).min(3),
});

/** Exported for `loadTheoryPayloadFromTopicDetails` — same contract as theory LLM output after migration. */
export const miniGameAffordancesSchema = z.object({
  categorySets: z.array(categorySetSchema).default([]),
  orderedSequences: z.array(orderedSequenceSchema).default([]),
  connectionPairs: z.array(connectionPairsSetSchema).default([]),
});

const theoryPayloadSchema = z.object({
  coreConcept: z.string().min(1),
  theory: z.string().min(1),
  keyTakeaways: z.array(z.string()).min(4),
  coreQuestionsByDifficulty: syllabusKeysSchema,
  miniGameAffordances: miniGameAffordancesSchema,
});

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

export type ParsedTopicTheoryPayload = {
  coreConcept: string;
  theory: string;
  keyTakeaways: string[];
  coreQuestionsByDifficulty: CoreQuestionsByDifficulty;
  groundingSources: GroundingSource[];
  miniGameAffordances: MiniGameAffordanceSet;
};

export type ParseTopicTheoryResult =
  | { ok: true; data: ParsedTopicTheoryPayload }
  | { ok: false; error: string };

export function parseTopicTheoryPayload(
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
): ParseTopicTheoryResult {
  const jsonStr = extractJsonString(raw);
  if (!jsonStr) {
    return { ok: false, error: 'No JSON found in assistant response' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr) as unknown;
  } catch (e) {
    logJsonParseError('parseTopicTheoryPayload', e, jsonStr);
    return { ok: false, error: 'Assistant response is not valid JSON' };
  }

  if (parsed && typeof parsed === 'object' && 'miniGameAffordances' in parsed) {
    const row = parsed as Record<string, unknown>;
    parsed = {
      ...row,
      miniGameAffordances: migrateMiniGameAffordancesInput(row.miniGameAffordances),
    };
  }

  const result = theoryPayloadSchema.safeParse(parsed);
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
      miniGameAffordances: result.data.miniGameAffordances,
    },
  };
}
