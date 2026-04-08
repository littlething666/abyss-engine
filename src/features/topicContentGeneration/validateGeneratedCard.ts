import type { Card, CardType, MiniGameType } from '@/types/core';

const CARD_TYPES: CardType[] = ['FLASHCARD', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'MINI_GAME'];
const MINI_GAME_TYPES: MiniGameType[] = ['CATEGORY_SORT', 'SEQUENCE_BUILD', 'CONNECTION_WEB'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateMiniGameContentShape(c: Record<string, unknown>): boolean {
  const gt = c.gameType;
  if (gt === 'CATEGORY_SORT') {
    return (
      typeof c.prompt === 'string' &&
      Array.isArray(c.categories) &&
      Array.isArray(c.items) &&
      typeof c.explanation === 'string'
    );
  }
  if (gt === 'SEQUENCE_BUILD') {
    return typeof c.prompt === 'string' && Array.isArray(c.items) && typeof c.explanation === 'string';
  }
  if (gt === 'CONNECTION_WEB') {
    return typeof c.prompt === 'string' && Array.isArray(c.pairs) && typeof c.explanation === 'string';
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
