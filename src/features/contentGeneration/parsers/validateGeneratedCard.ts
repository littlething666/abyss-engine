import type { Card, CardType, MiniGameType } from '@/types/core';

const CARD_TYPES: CardType[] = ['FLASHCARD', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'MINI_GAME'];
const MINI_GAME_TYPES: MiniGameType[] = ['CATEGORY_SORT', 'SEQUENCE_BUILD', 'CONNECTION_WEB'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateCategorySortContent(c: Record<string, unknown>): boolean {
  if (typeof c.prompt !== 'string' || c.prompt.length === 0) return false;
  if (typeof c.explanation !== 'string') return false;
  const categories = c.categories;
  const items = c.items;
  if (!Array.isArray(categories) || categories.length === 0) return false;
  if (!Array.isArray(items) || items.length === 0) return false;

  const catIds = new Set<string>();
  for (const cat of categories) {
    if (!isRecord(cat)) return false;
    if (typeof cat.id !== 'string' || cat.id.length === 0) return false;
    if (typeof cat.label !== 'string' || cat.label.length === 0) return false;
    if (catIds.has(cat.id)) return false;
    catIds.add(cat.id);
  }

  const itemIds = new Set<string>();
  for (const it of items) {
    if (!isRecord(it)) return false;
    if (typeof it.id !== 'string' || it.id.length === 0) return false;
    if (typeof it.label !== 'string' || it.label.length === 0) return false;
    if (typeof it.categoryId !== 'string' || it.categoryId.length === 0) return false;
    if (!catIds.has(it.categoryId)) return false;
    if (itemIds.has(it.id)) return false;
    itemIds.add(it.id);
  }
  return true;
}

function validateSequenceBuildContent(c: Record<string, unknown>): boolean {
  if (typeof c.prompt !== 'string' || c.prompt.length === 0) return false;
  if (typeof c.explanation !== 'string') return false;
  const items = c.items;
  if (!Array.isArray(items) || items.length === 0) return false;

  const itemIds = new Set<string>();
  for (const it of items) {
    if (!isRecord(it)) return false;
    if (typeof it.id !== 'string' || it.id.length === 0) return false;
    if (typeof it.label !== 'string' || it.label.length === 0) return false;
    if (typeof it.correctPosition !== 'number' || !Number.isInteger(it.correctPosition)) return false;
    if (it.correctPosition < 0) return false;
    if (itemIds.has(it.id)) return false;
    itemIds.add(it.id);
  }
  return true;
}

function validateConnectionWebContent(c: Record<string, unknown>): boolean {
  if (typeof c.prompt !== 'string' || c.prompt.length === 0) return false;
  if (typeof c.explanation !== 'string') return false;
  const pairs = c.pairs;
  if (!Array.isArray(pairs) || pairs.length === 0) return false;

  const pairIds = new Set<string>();
  for (const p of pairs) {
    if (!isRecord(p)) return false;
    if (typeof p.id !== 'string' || p.id.length === 0) return false;
    if (typeof p.left !== 'string' || p.left.length === 0) return false;
    if (typeof p.right !== 'string' || p.right.length === 0) return false;
    if (pairIds.has(p.id)) return false;
    pairIds.add(p.id);
  }

  const dist = c.distractors;
  if (dist !== undefined) {
    if (!Array.isArray(dist)) return false;
    const distractorIds = new Set<string>();
    for (const d of dist) {
      if (!isRecord(d)) return false;
      if (typeof d.id !== 'string' || d.id.length === 0) return false;
      if (d.side !== 'left' && d.side !== 'right') return false;
      if (typeof d.label !== 'string' || d.label.length === 0) return false;
      if (distractorIds.has(d.id)) return false;
      distractorIds.add(d.id);
    }
  }
  return true;
}

function validateMiniGameContentShape(c: Record<string, unknown>): boolean {
  const gt = c.gameType;
  if (gt === 'CATEGORY_SORT') {
    return validateCategorySortContent(c);
  }
  if (gt === 'SEQUENCE_BUILD') {
    return validateSequenceBuildContent(c);
  }
  if (gt === 'CONNECTION_WEB') {
    return validateConnectionWebContent(c);
  }
  return false;
}

export function validateGeneratedCard(raw: unknown): raw is Card {
  if (!isRecord(raw)) {
    return false;
  }
  const id = raw.id;
  const type = raw.type;
  const difficulty = raw.difficulty;
  const content = raw.content;
  if (typeof id !== 'string' || id.length === 0) {
    return false;
  }
  if (typeof difficulty !== 'number' || difficulty < 1 || difficulty > 4) {
    return false;
  }
  if (typeof type !== 'string' || !CARD_TYPES.includes(type as CardType)) {
    return false;
  }
  if (!isRecord(content)) {
    return false;
  }

  switch (type as CardType) {
    case 'FLASHCARD':
      return typeof content.front === 'string' && typeof content.back === 'string';
    case 'SINGLE_CHOICE':
      return (
        typeof content.question === 'string' &&
        Array.isArray(content.options) &&
        typeof content.correctAnswer === 'string' &&
        typeof content.explanation === 'string'
      );
    case 'MULTI_CHOICE':
      return (
        typeof content.question === 'string' &&
        Array.isArray(content.options) &&
        Array.isArray(content.correctAnswers) &&
        typeof content.explanation === 'string'
      );
    case 'MINI_GAME': {
      const gt = content.gameType;
      if (typeof gt !== 'string' || !MINI_GAME_TYPES.includes(gt as MiniGameType)) {
        return false;
      }
      return validateMiniGameContentShape(content as Record<string, unknown>);
    }
    default:
      return false;
  }
}
