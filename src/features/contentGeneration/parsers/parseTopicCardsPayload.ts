import { extractJsonString, logJsonParseError } from '@/lib/llmResponseText';
import type { Card } from '@/types/core';

import { normalizeGeneratedCardItem } from './normalizeGeneratedCardItem';
import { validateGeneratedCard } from './validateGeneratedCard';

export type ParseTopicCardsResult = { ok: true; cards: Card[] } | { ok: false; error: string };

export function parseTopicCardsPayload(raw: string): ParseTopicCardsResult {
  const jsonStr = extractJsonString(raw);
  if (!jsonStr) {
    return { ok: false, error: 'No JSON found in assistant response' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr) as unknown;
  } catch (e) {
    logJsonParseError('parseTopicCardsPayload', e, jsonStr);
    return { ok: false, error: 'Assistant response is not valid JSON' };
  }

  let list: unknown[];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { cards?: unknown }).cards)) {
    list = (parsed as { cards: unknown[] }).cards;
  } else {
    return { ok: false, error: 'Expected a JSON array or an object with a cards array' };
  }

  const cards: Card[] = [];
  for (const item of list) {
    const normalized = normalizeGeneratedCardItem(item);
    if (validateGeneratedCard(normalized)) {
      cards.push(normalized as Card);
    }
  }

  if (cards.length === 0) {
    return { ok: false, error: 'No valid cards parsed from assistant response' };
  }

  return { ok: true, cards };
}

/** Debug-only: why parsing/validation failed without changing `parseTopicCardsPayload` behavior. */
export function diagnoseTopicCardsPayload(raw: string): Record<string, unknown> {
  const jsonStr = extractJsonString(raw);
  if (!jsonStr) {
    return { step: 'extractJsonString', ok: false, reason: 'no_json_span' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    logJsonParseError('diagnoseTopicCardsPayload', e, jsonStr);
    return {
      step: 'json.parse',
      ok: false,
      reason: 'invalid_json',
      message: e instanceof Error ? e.message : String(e),
      jsonStrHead: jsonStr.slice(0, 4000),
    };
  }
  let list: unknown[];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { cards?: unknown }).cards)) {
    list = (parsed as { cards: unknown[] }).cards;
  } else {
    return {
      step: 'shape',
      ok: false,
      reason: 'not_array_or_cards_wrapper',
      parsedIsArray: Array.isArray(parsed),
      parsedKeys:
        typeof parsed === 'object' && parsed !== null ? Object.keys(parsed as object).slice(0, 20) : [],
    };
  }
  let validatedCount = 0;
  const invalidSamples: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const normalized = normalizeGeneratedCardItem(item);
    if (validateGeneratedCard(normalized)) {
      validatedCount++;
    } else if (invalidSamples.length < 4) {
      invalidSamples.push(JSON.stringify(normalized).slice(0, 500));
    }
  }
  return {
    step: 'validate',
    ok: validatedCount > 0,
    listLength: list.length,
    validatedCount,
    invalidSamples,
  };
}
