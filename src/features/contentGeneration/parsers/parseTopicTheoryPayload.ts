import { extractJsonString, logJsonParseError } from '@/lib/llmResponseText';
import type { CoreQuestionsByDifficulty } from '@/types/core';
import { z } from 'zod';

const syllabusKeysSchema = z.object({
  '1': z.array(z.string()).min(1),
  '2': z.array(z.string()).min(1),
  '3': z.array(z.string()).min(1),
});

const theoryPayloadSchema = z.object({
  coreConcept: z.string().min(1),
  theory: z.string().min(1),
  keyTakeaways: z.array(z.string()).min(4),
  coreQuestionsByDifficulty: syllabusKeysSchema,
});

export type ParsedTopicTheoryPayload = {
  coreConcept: string;
  theory: string;
  keyTakeaways: string[];
  coreQuestionsByDifficulty: CoreQuestionsByDifficulty;
};

export type ParseTopicTheoryResult =
  | { ok: true; data: ParsedTopicTheoryPayload }
  | { ok: false; error: string };

export function parseTopicTheoryPayload(raw: string): ParseTopicTheoryResult {
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
  };

  return {
    ok: true,
    data: {
      coreConcept: result.data.coreConcept,
      theory: result.data.theory,
      keyTakeaways: result.data.keyTakeaways,
      coreQuestionsByDifficulty,
    },
  };
}
