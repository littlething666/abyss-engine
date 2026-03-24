import { extractJsonObjectString } from '@/lib/llmResponseText';
import type { SubjectGraph } from '../../types/core';
import { subjectGraphSchema } from './subjectGraphSchema';

export type ParseSubjectGraphResult =
  | { ok: true; graph: SubjectGraph }
  | { ok: false; error: string };

export function parseSubjectGraphResponse(raw: string): ParseSubjectGraphResult {
  const jsonStr = extractJsonObjectString(raw);
  if (!jsonStr) {
    return { ok: false, error: 'No JSON object found in assistant response' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr) as unknown;
  } catch {
    return { ok: false, error: 'Assistant response is not valid JSON' };
  }

  const result = subjectGraphSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.length ? issue.path.join('.') : 'root';
    return { ok: false, error: `Invalid curriculum graph schema at ${path}: ${issue?.message ?? 'unknown'}` };
  }

  return { ok: true, graph: result.data as SubjectGraph };
}
