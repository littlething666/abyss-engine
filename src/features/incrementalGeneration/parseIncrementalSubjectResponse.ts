import { extractJsonObjectString, logJsonParseError } from '@/lib/llmResponseText';
import type { SubjectGraph } from '@/types/core';
import { z } from 'zod';

import { subjectGraphSchema } from '../ascentWeaver/subjectGraphSchema';

const geometrySchema = z.object({
  gridTile: z.enum(['box', 'cylinder', 'sphere', 'octahedron', 'plane']),
});

const subjectPayloadSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  color: z.string().min(1),
  geometry: geometrySchema.optional(),
});

const incrementalPayloadSchema = z.object({
  subject: subjectPayloadSchema,
  graph: subjectGraphSchema,
});

export type ParsedIncrementalSubject = z.infer<typeof subjectPayloadSchema>;
export type ParseIncrementalSubjectResult =
  | { ok: true; subject: ParsedIncrementalSubject; graph: SubjectGraph }
  | { ok: false; error: string };

export function parseIncrementalSubjectResponse(raw: string): ParseIncrementalSubjectResult {
  const jsonStr = extractJsonObjectString(raw);
  if (!jsonStr) {
    return { ok: false, error: 'No JSON object found in assistant response' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr) as unknown;
  } catch (e) {
    logJsonParseError('parseIncrementalSubjectResponse', e, jsonStr);
    return { ok: false, error: 'Assistant response is not valid JSON' };
  }

  const result = incrementalPayloadSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.length ? issue.path.join('.') : 'root';
    return { ok: false, error: `Invalid incremental subject payload at ${path}: ${issue?.message ?? 'unknown'}` };
  }

  return { ok: true, subject: result.data.subject, graph: result.data.graph as SubjectGraph };
}
