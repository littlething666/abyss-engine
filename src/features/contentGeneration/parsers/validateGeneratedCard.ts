import type { Card, CardType, MiniGameType } from '@/types/core';
import type { GeneratedCardValidationFailure } from '@/types/contentQuality';

const CARD_TYPES: CardType[] = ['FLASHCARD', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'MINI_GAME'];
const MINI_GAME_TYPES: MiniGameType[] = ['CATEGORY_SORT', 'SEQUENCE_BUILD', 'CONNECTION_WEB'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function failure(
  cardId: string | null,
  index: number,
  code: string,
  message: string,
): GeneratedCardValidationFailure {
  return { cardId, index, code, message, severity: 'critical' };
}

function hasDuplicateStrings(values: string[]): boolean {
  const normalized = values.map((value) => value.trim().toLowerCase());
  return new Set(normalized).size !== normalized.length;
}

function validateCategorySortContent(
  cardId: string | null,
  index: number,
  c: Record<string, unknown>,
  failures: GeneratedCardValidationFailure[],
): void {
  if (typeof c.prompt !== 'string' || c.prompt.length === 0) failures.push(failure(cardId, index, 'missing_prompt', 'Category sort prompt is required'));
  if (typeof c.explanation !== 'string') failures.push(failure(cardId, index, 'missing_explanation', 'Category sort explanation is required'));
  const categories = c.categories;
  const items = c.items;
  if (!Array.isArray(categories) || categories.length < 3) {
    failures.push(failure(cardId, index, 'category_count', 'CATEGORY_SORT requires at least 3 categories'));
    return;
  }
  if (!Array.isArray(items) || items.length < 6) {
    failures.push(failure(cardId, index, 'item_count', 'CATEGORY_SORT requires at least 6 items'));
    return;
  }

  const catIds = new Set<string>();
  const catLabels: string[] = [];
  for (const cat of categories) {
    if (!isRecord(cat)) {
      failures.push(failure(cardId, index, 'invalid_category', 'Each category must be an object'));
      continue;
    }
    if (typeof cat.id !== 'string' || cat.id.length === 0) failures.push(failure(cardId, index, 'category_id', 'Category id is required'));
    if (typeof cat.label !== 'string' || cat.label.length === 0) failures.push(failure(cardId, index, 'category_label', 'Category label is required'));
    if (typeof cat.id === 'string' && catIds.has(cat.id)) failures.push(failure(cardId, index, 'duplicate_category_id', `Duplicate category id: ${cat.id}`));
    if (typeof cat.label === 'string') catLabels.push(cat.label);
    if (typeof cat.id === 'string') catIds.add(cat.id);
  }
  if (hasDuplicateStrings(catLabels)) failures.push(failure(cardId, index, 'duplicate_category_label', 'Category labels must be unique'));

  const itemIds = new Set<string>();
  const itemLabels: string[] = [];
  const usedCategories = new Set<string>();
  for (const it of items) {
    if (!isRecord(it)) {
      failures.push(failure(cardId, index, 'invalid_item', 'Each category item must be an object'));
      continue;
    }
    if (typeof it.id !== 'string' || it.id.length === 0) failures.push(failure(cardId, index, 'item_id', 'Category item id is required'));
    if (typeof it.label !== 'string' || it.label.length === 0) failures.push(failure(cardId, index, 'item_label', 'Category item label is required'));
    if (typeof it.categoryId !== 'string' || it.categoryId.length === 0) failures.push(failure(cardId, index, 'item_category_id', 'Category item categoryId is required'));
    if (typeof it.categoryId === 'string' && !catIds.has(it.categoryId)) failures.push(failure(cardId, index, 'unknown_category_id', `Unknown categoryId: ${it.categoryId}`));
    if (typeof it.id === 'string' && itemIds.has(it.id)) failures.push(failure(cardId, index, 'duplicate_item_id', `Duplicate item id: ${it.id}`));
    if (typeof it.id === 'string') itemIds.add(it.id);
    if (typeof it.label === 'string') itemLabels.push(it.label);
    if (typeof it.categoryId === 'string') usedCategories.add(it.categoryId);
  }
  if (hasDuplicateStrings(itemLabels)) failures.push(failure(cardId, index, 'duplicate_item_label', 'Category item labels must be unique'));
  for (const catId of catIds) {
    if (!usedCategories.has(catId)) failures.push(failure(cardId, index, 'unused_category', `Category has no items: ${catId}`));
  }
}

function validateSequenceBuildContent(
  cardId: string | null,
  index: number,
  c: Record<string, unknown>,
  failures: GeneratedCardValidationFailure[],
): void {
  if (typeof c.prompt !== 'string' || c.prompt.length === 0) failures.push(failure(cardId, index, 'missing_prompt', 'Sequence prompt is required'));
  if (typeof c.explanation !== 'string') failures.push(failure(cardId, index, 'missing_explanation', 'Sequence explanation is required'));
  const items = c.items;
  if (!Array.isArray(items) || items.length < 3) {
    failures.push(failure(cardId, index, 'sequence_item_count', 'SEQUENCE_BUILD requires at least 3 items'));
    return;
  }

  const itemIds = new Set<string>();
  const labels: string[] = [];
  const positions: number[] = [];
  for (const it of items) {
    if (!isRecord(it)) {
      failures.push(failure(cardId, index, 'invalid_sequence_item', 'Each sequence item must be an object'));
      continue;
    }
    if (typeof it.id !== 'string' || it.id.length === 0) failures.push(failure(cardId, index, 'sequence_item_id', 'Sequence item id is required'));
    if (typeof it.label !== 'string' || it.label.length === 0) failures.push(failure(cardId, index, 'sequence_item_label', 'Sequence item label is required'));
    if (typeof it.correctPosition !== 'number' || !Number.isInteger(it.correctPosition)) failures.push(failure(cardId, index, 'sequence_position', 'Sequence correctPosition must be an integer'));
    if (typeof it.correctPosition === 'number') positions.push(it.correctPosition);
    if (typeof it.id === 'string' && itemIds.has(it.id)) failures.push(failure(cardId, index, 'duplicate_sequence_item_id', `Duplicate sequence item id: ${it.id}`));
    if (typeof it.id === 'string') itemIds.add(it.id);
    if (typeof it.label === 'string') labels.push(it.label);
  }
  if (hasDuplicateStrings(labels)) failures.push(failure(cardId, index, 'duplicate_sequence_label', 'Sequence item labels must be unique'));
  const sortedPositions = [...positions].sort((a, b) => a - b);
  for (let i = 0; i < items.length; i++) {
    if (sortedPositions[i] !== i) failures.push(failure(cardId, index, 'non_contiguous_sequence', 'Sequence positions must be contiguous 0..n-1'));
  }
}

function validateConnectionWebContent(
  cardId: string | null,
  index: number,
  c: Record<string, unknown>,
  failures: GeneratedCardValidationFailure[],
): void {
  if (typeof c.prompt !== 'string' || c.prompt.length === 0) failures.push(failure(cardId, index, 'missing_prompt', 'Connection web prompt is required'));
  if (typeof c.explanation !== 'string') failures.push(failure(cardId, index, 'missing_explanation', 'Connection web explanation is required'));
  const pairs = c.pairs;
  if (!Array.isArray(pairs) || pairs.length < 3) {
    failures.push(failure(cardId, index, 'connection_pair_count', 'CONNECTION_WEB requires at least 3 pairs'));
    return;
  }

  const pairIds = new Set<string>();
  const leftLabels: string[] = [];
  const rightLabels: string[] = [];
  for (const p of pairs) {
    if (!isRecord(p)) {
      failures.push(failure(cardId, index, 'invalid_pair', 'Each connection pair must be an object'));
      continue;
    }
    if (typeof p.id !== 'string' || p.id.length === 0) failures.push(failure(cardId, index, 'pair_id', 'Pair id is required'));
    if (typeof p.left !== 'string' || p.left.length === 0) failures.push(failure(cardId, index, 'pair_left', 'Pair left label is required'));
    if (typeof p.right !== 'string' || p.right.length === 0) failures.push(failure(cardId, index, 'pair_right', 'Pair right label is required'));
    if (typeof p.id === 'string' && pairIds.has(p.id)) failures.push(failure(cardId, index, 'duplicate_pair_id', `Duplicate pair id: ${p.id}`));
    if (typeof p.id === 'string') pairIds.add(p.id);
    if (typeof p.left === 'string') leftLabels.push(p.left);
    if (typeof p.right === 'string') rightLabels.push(p.right);
  }
  if (hasDuplicateStrings(leftLabels)) failures.push(failure(cardId, index, 'duplicate_left_label', 'Connection left labels must be unique'));
  if (hasDuplicateStrings(rightLabels)) failures.push(failure(cardId, index, 'duplicate_right_label', 'Connection right labels must be unique'));

  const dist = c.distractors;
  if (dist !== undefined) {
    if (!Array.isArray(dist)) {
      failures.push(failure(cardId, index, 'invalid_distractors', 'Distractors must be an array'));
      return;
    }
    const distractorIds = new Set<string>();
    for (const d of dist) {
      if (!isRecord(d)) {
        failures.push(failure(cardId, index, 'invalid_distractor', 'Each distractor must be an object'));
        continue;
      }
      if (typeof d.id !== 'string' || d.id.length === 0) failures.push(failure(cardId, index, 'distractor_id', 'Distractor id is required'));
      if (d.side !== 'left' && d.side !== 'right') failures.push(failure(cardId, index, 'distractor_side', 'Distractor side must be left or right'));
      if (typeof d.label !== 'string' || d.label.length === 0) failures.push(failure(cardId, index, 'distractor_label', 'Distractor label is required'));
      if (typeof d.id === 'string' && distractorIds.has(d.id)) failures.push(failure(cardId, index, 'duplicate_distractor_id', `Duplicate distractor id: ${d.id}`));
      if (typeof d.id === 'string') distractorIds.add(d.id);
      if (typeof d.label === 'string') {
        const allPairLabels = [...leftLabels, ...rightLabels].map((label) => label.trim().toLowerCase());
        if (allPairLabels.includes(d.label.trim().toLowerCase())) {
          failures.push(failure(cardId, index, 'distractor_collision', `Distractor collides with pair label: ${d.label}`));
        }
      }
    }
  }
}

function validateMiniGameContentShape(
  cardId: string | null,
  index: number,
  c: Record<string, unknown>,
  failures: GeneratedCardValidationFailure[],
): void {
  const gt = c.gameType;
  if (gt === 'CATEGORY_SORT') {
    validateCategorySortContent(cardId, index, c, failures);
    return;
  }
  if (gt === 'SEQUENCE_BUILD') {
    validateSequenceBuildContent(cardId, index, c, failures);
    return;
  }
  if (gt === 'CONNECTION_WEB') {
    validateConnectionWebContent(cardId, index, c, failures);
    return;
  }
  failures.push(failure(cardId, index, 'invalid_game_type', 'Unknown mini-game type'));
}

export function validateGeneratedCardDetailed(
  raw: unknown,
  index = 0,
): { ok: true; card: Card } | { ok: false; failures: GeneratedCardValidationFailure[] } {
  const failures: GeneratedCardValidationFailure[] = [];
  if (!isRecord(raw)) {
    return { ok: false, failures: [failure(null, index, 'card_shape', 'Card must be an object')] };
  }
  const id = raw.id;
  const type = raw.type;
  const difficulty = raw.difficulty;
  const content = raw.content;
  const cardId = typeof id === 'string' ? id : null;
  if (typeof id !== 'string' || id.length === 0) {
    failures.push(failure(cardId, index, 'card_id', 'Card id is required'));
  }
  if (typeof difficulty !== 'number' || difficulty < 1 || difficulty > 4) {
    failures.push(failure(cardId, index, 'difficulty', 'Difficulty must be a number from 1 to 4'));
  }
  if (typeof type !== 'string' || !CARD_TYPES.includes(type as CardType)) {
    failures.push(failure(cardId, index, 'card_type', 'Card type is invalid'));
  }
  if (!isRecord(content)) {
    failures.push(failure(cardId, index, 'content_shape', 'Card content must be an object'));
    return { ok: false, failures };
  }

  switch (type as CardType) {
    case 'FLASHCARD':
      if (typeof content.front !== 'string' || !content.front.trim()) failures.push(failure(cardId, index, 'flashcard_front', 'Flashcard front is required'));
      if (typeof content.back !== 'string' || !content.back.trim()) failures.push(failure(cardId, index, 'flashcard_back', 'Flashcard back is required'));
      break;
    case 'SINGLE_CHOICE':
      if (typeof content.question !== 'string' || !content.question.trim()) failures.push(failure(cardId, index, 'choice_question', 'Single-choice question is required'));
      if (!Array.isArray(content.options) || content.options.length < 3) failures.push(failure(cardId, index, 'choice_options', 'SINGLE_CHOICE requires at least 3 options'));
      if (Array.isArray(content.options) && hasDuplicateStrings(content.options.filter((x): x is string => typeof x === 'string'))) failures.push(failure(cardId, index, 'duplicate_options', 'Single-choice options must be unique'));
      if (typeof content.correctAnswer !== 'string') failures.push(failure(cardId, index, 'correct_answer', 'Single-choice correctAnswer is required'));
      const singleOptions = Array.isArray(content.options) ? content.options.filter((x): x is string => typeof x === 'string') : [];
      if (typeof content.correctAnswer === 'string' && !singleOptions.includes(content.correctAnswer)) failures.push(failure(cardId, index, 'correct_answer_not_in_options', 'correctAnswer must match one option'));
      if (typeof content.explanation !== 'string') failures.push(failure(cardId, index, 'choice_explanation', 'Single-choice explanation is required'));
      break;
    case 'MULTI_CHOICE':
      if (typeof content.question !== 'string' || !content.question.trim()) failures.push(failure(cardId, index, 'choice_question', 'Multi-choice question is required'));
      if (!Array.isArray(content.options) || content.options.length < 3) failures.push(failure(cardId, index, 'choice_options', 'MULTI_CHOICE requires at least 3 options'));
      if (!Array.isArray(content.correctAnswers) || content.correctAnswers.length === 0) failures.push(failure(cardId, index, 'correct_answers', 'MULTI_CHOICE requires at least one correct answer'));
      if (Array.isArray(content.options) && hasDuplicateStrings(content.options.filter((x): x is string => typeof x === 'string'))) failures.push(failure(cardId, index, 'duplicate_options', 'Multi-choice options must be unique'));
      if (Array.isArray(content.options) && Array.isArray(content.correctAnswers)) {
        const multiOptions = content.options.filter((x): x is string => typeof x === 'string');
        for (const answer of content.correctAnswers) {
          if (typeof answer !== 'string' || !multiOptions.includes(answer)) failures.push(failure(cardId, index, 'correct_answer_not_in_options', 'Every correct answer must match an option'));
        }
      }
      if (typeof content.explanation !== 'string') failures.push(failure(cardId, index, 'choice_explanation', 'Multi-choice explanation is required'));
      break;
    case 'MINI_GAME': {
      const gt = content.gameType;
      if (typeof gt !== 'string' || !MINI_GAME_TYPES.includes(gt as MiniGameType)) {
        failures.push(failure(cardId, index, 'mini_game_type', 'Mini-game type is invalid'));
        break;
      }
      validateMiniGameContentShape(cardId, index, content as Record<string, unknown>, failures);
      break;
    }
    default:
      failures.push(failure(cardId, index, 'card_type', 'Card type is invalid'));
  }
  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, card: raw as unknown as Card };
}

export function validateGeneratedCard(raw: unknown): raw is Card {
  return validateGeneratedCardDetailed(raw).ok;
}
