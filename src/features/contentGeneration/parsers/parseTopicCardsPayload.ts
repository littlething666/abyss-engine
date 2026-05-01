import { extractJsonString, logJsonParseError } from '@/lib/llmResponseText';
import type { Card, CardType, MiniGameContent, MiniGameType } from '@/types/core';
import type {
  ExistingConceptRegistry,
  GeneratedCardQualityReport,
  GeneratedCardValidationFailure,
} from '@/types/contentQuality';
import type { GroundingSource } from '@/types/grounding';

import { isDuplicateConceptTarget } from '../quality/compareConceptTargets';
import { computeQualityReport } from '../quality/computeQualityReport';
import { extractConceptTarget } from '../quality/extractConceptTarget';
import { normalizeGeneratedCardItem } from './normalizeGeneratedCardItem';
import { validateGeneratedCard, validateGeneratedCardDetailed } from './validateGeneratedCard';

export type ParseTopicCardsResult =
  | { ok: true; cards: Card[]; qualityReport: GeneratedCardQualityReport }
  | { ok: false; error: string; qualityReport?: GeneratedCardQualityReport };

export interface ParseTopicCardsOptions {
  existingRegistry?: ExistingConceptRegistry;
  groundingSources?: GroundingSource[];
  invalidCardRatioThreshold?: number;
  duplicateRatioThreshold?: number;
  /** When set, only these card types may appear in the output (others become critical failures). */
  allowedCardTypes?: readonly CardType[];
  /** When set, `MINI_GAME` cards must use one of these `content.gameType` values. */
  allowedMiniGameTypes?: readonly MiniGameType[];
}

const DEFAULT_INVALID_RATIO_THRESHOLD = 0.2;
const DEFAULT_DUPLICATE_RATIO_THRESHOLD = 0.1;

function cardIdOf(raw: unknown): string | null {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const id = (raw as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

export function parseTopicCardsPayload(
  raw: string,
  options: ParseTopicCardsOptions = {},
): ParseTopicCardsResult {
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
  const failures: GeneratedCardValidationFailure[] = [];
  const seenIds = new Set<string>();
  const conceptTargets: string[] = [];
  let duplicateConceptCount = 0;

  for (let index = 0; index < list.length; index++) {
    const item = list[index];
    const normalized = normalizeGeneratedCardItem(item);
    const validation = validateGeneratedCardDetailed(normalized, index);
    if (!validation.ok) {
      failures.push(...validation.failures);
      continue;
    }

    if (options.allowedCardTypes && !options.allowedCardTypes.includes(validation.card.type)) {
      failures.push({
        cardId: validation.card.id,
        index,
        code: 'card_type_mismatch',
        message: `Expected card types [${options.allowedCardTypes.join(', ')}]; got ${validation.card.type}`,
        severity: 'critical',
      });
      continue;
    }

    if (
      options.allowedMiniGameTypes &&
      validation.card.type === 'MINI_GAME'
    ) {
      const miniContent = validation.card.content as MiniGameContent;
      const gt = miniContent.gameType;
      if (!options.allowedMiniGameTypes.includes(gt)) {
        failures.push({
          cardId: validation.card.id,
          index,
          code: 'mini_game_type_mismatch',
          message: `Expected mini-game types [${options.allowedMiniGameTypes.join(', ')}]; got ${gt}`,
          severity: 'critical',
        });
        continue;
      }
    }

    const id = validation.card.id;
    if (seenIds.has(id) || options.existingRegistry?.cardIds.includes(id)) {
      failures.push({
        cardId: id,
        index,
        code: 'duplicate_card_id',
        message: `Duplicate generated or existing card id: ${id}`,
        severity: 'critical',
      });
      continue;
    }
    seenIds.add(id);

    const conceptTarget = extractConceptTarget(validation.card);
    const duplicatesWithinJob = conceptTargets.some((target) => isDuplicateConceptTarget(target, conceptTarget));
    const duplicatesExisting = options.existingRegistry?.conceptTargets.some((target) => isDuplicateConceptTarget(target, conceptTarget)) ?? false;
    if (duplicatesWithinJob || duplicatesExisting) {
      duplicateConceptCount += 1;
    }
    conceptTargets.push(conceptTarget);
    cards.push({ ...validation.card, conceptTarget });
  }

  const qualityReport = computeQualityReport({
    emittedCount: list.length,
    validCount: cards.length,
    duplicateConceptCount,
    groundingSources: options.groundingSources,
    failures,
  });

  const invalidThreshold = options.invalidCardRatioThreshold ?? DEFAULT_INVALID_RATIO_THRESHOLD;
  const duplicateThreshold = options.duplicateRatioThreshold ?? DEFAULT_DUPLICATE_RATIO_THRESHOLD;
  const criticalFailure = failures.some((item) => item.severity === 'critical');

  if (cards.length === 0) {
    return { ok: false, error: 'No valid cards parsed from assistant response', qualityReport };
  }
  if (qualityReport.invalidRatio > invalidThreshold || criticalFailure) {
    return {
      ok: false,
      error: `Generated cards failed validation (${failures.length} issue${failures.length === 1 ? '' : 's'})`,
      qualityReport,
    };
  }
  if (cards.length >= 10 && qualityReport.duplicateConceptRatio > duplicateThreshold) {
    return {
      ok: false,
      error: `Generated cards exceeded duplicate concept threshold (${qualityReport.duplicateConceptCount}/${cards.length})`,
      qualityReport,
    };
  }

  return { ok: true, cards, qualityReport };
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
      invalidSamples.push(JSON.stringify({ id: cardIdOf(normalized), normalized }).slice(0, 500));
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
