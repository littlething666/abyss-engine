/**
 * Single-pass strict parser for durable generation artifacts.
 *
 * Contract (matches the AGENTS.md "Strict pipeline parser policy"):
 *   1. Input is the EXACT JSON string returned by the LLM provider in
 *      strict `json_schema` mode. Markdown fences, leading/trailing
 *      whitespace beyond what the OpenRouter envelope already trims,
 *      embedded prose, or any recovery transformation are NOT performed.
 *      Anything that is not a parseable top-level JSON value is a
 *      `parse:json-mode-violation`.
 *   2. The Zod schema is the single source of truth for accepted shapes.
 *      Extra keys on `.strict()` objects are rejected with
 *      `parse:zod-shape`.
 *   3. No fallback. No second parser. No probabilistic recovery.
 *
 * The structured failure code makes downstream observability,
 * retry routing, and HUD copy independent of which pipeline produced
 * the failure.
 */

import type { z } from 'zod';

export type StrictParseFailureCode =
  | 'parse:json-mode-violation'
  | 'parse:zod-shape';

export type StrictParseResult<T> =
  | { ok: true; payload: T }
  | { ok: false; failureCode: StrictParseFailureCode; message: string };

export function strictParse<TOut>(
  raw: string,
  schema: z.ZodType<TOut>,
): StrictParseResult<TOut> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      failureCode: 'parse:json-mode-violation',
      message: `Strict parser refused non-JSON input: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.length
      ? issue.path.map(String).join('.')
      : 'root';
    return {
      ok: false,
      failureCode: 'parse:zod-shape',
      message: `Strict parser rejected payload at ${path}: ${issue?.message ?? 'unknown'}`,
    };
  }
  return { ok: true, payload: result.data };
}
