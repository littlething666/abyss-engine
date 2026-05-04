import { extractJsonString, logJsonParseError } from '@/lib/llmResponseText';
import type { TopicLattice } from '@/types/topicLattice';

import { topicLatticeResponseSchema } from './topicLatticeSchema';

export type ParseTopicLatticeResult = { ok: true; lattice: TopicLattice } | { ok: false; error: string };

/**
 * Permissive Subject Graph Stage A topic-lattice parser.
 *
 * @deprecated **Do not use in durable pipeline code paths.**
 *
 * This parser strips markdown fences via `extractJsonString` before running
 * `topicLatticeResponseSchema.safeParse`. The durable Subject Graph Generation
 * pipeline (Stage A) must call OpenRouter with strict `json_schema` mode and
 * fail loudly via `parse:json-mode-violation` / `parse:zod-shape` on anything
 * other than exact, schema-conformant JSON. Use the strict pipeline parser
 * instead, via `strictParseArtifact('subject-graph-topics', raw)` from
 * `@/features/generationContracts`.
 *
 * Note: this deprecation is **for the parser only**. The Stage B
 * `correctPrereqEdges` deterministic repair pass for `subject-graph-edges`
 * (AGENTS.md curriculum-prerequisite-edges narrow exception) is unaffected
 * and continues to run before the strict schema check on Stage B output.
 *
 * Allowed remaining callers: legacy in-tab Subject Graph runners until Phase 2
 * migrates Subject Graph Generation to the durable runner. Scheduled for
 * removal from generation pipeline code paths in Phase 4.
 */
export function parseTopicLatticeResponse(raw: string): ParseTopicLatticeResult {
  const jsonStr = extractJsonString(raw);
  if (!jsonStr) {
    return { ok: false, error: 'No JSON found in assistant response' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr) as unknown;
  } catch (e) {
    logJsonParseError('parseTopicLatticeResponse', e, jsonStr);
    return { ok: false, error: 'Assistant response is not valid JSON' };
  }

  const result = topicLatticeResponseSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.length ? issue.path.join('.') : 'root';
    return { ok: false, error: `Invalid topic lattice schema at ${path}: ${issue?.message ?? 'unknown'}` };
  }

  return { ok: true, lattice: { topics: result.data.topics } };
}
