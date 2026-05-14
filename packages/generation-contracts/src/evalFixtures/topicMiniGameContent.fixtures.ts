import type { EvalFixture } from './types';

function categorySort(overrides: Record<string, unknown> = {}) {
  return {
    id: 'temporary-mini-game-id',
    topicId: 'limits',
    type: 'MINI_GAME',
    difficulty: 2,
    content: {
      gameType: 'CATEGORY_SORT',
      categories: [{ id: 'approaches', label: 'Approaches' }, { id: 'does-not-approach', label: 'Does not approach' }],
      items: [{ id: 'item-1', label: 'f(x) gets closer to 3', categoryId: 'approaches' }, { id: 'item-2', label: 'f(x) jumps randomly', categoryId: 'does-not-approach' }],
    },
    ...overrides,
  };
}

function sequenceBuild(overrides: Record<string, unknown> = {}) {
  return {
    id: 'temporary-sequence-id',
    topicId: 'limits',
    type: 'MINI_GAME',
    difficulty: 3,
    content: {
      gameType: 'SEQUENCE_BUILD',
      steps: [{ id: 's1', label: 'Choose the input point', order: 1 }, { id: 's2', label: 'Track nearby outputs', order: 2 }],
    },
    ...overrides,
  };
}

function matchPairs(overrides: Record<string, unknown> = {}) {
  return {
    id: 'temporary-pairs-id',
    topicId: 'limits',
    type: 'MINI_GAME',
    difficulty: 1,
    content: {
      gameType: 'MATCH_PAIRS',
      pairs: [{ id: 'p1', left: 'lim', right: 'approached value' }, { id: 'p2', left: 'x→a', right: 'input approaches a' }],
    },
    ...overrides,
  };
}

const acceptCards = [
  categorySort({ id: 'temporary-mini-game-id-1' }),
  categorySort({ id: 'temporary-mini-game-id-2', difficulty: 1 }),
  categorySort({ id: 'temporary-mini-game-id-3', difficulty: 4 }),
  sequenceBuild({ id: 'temporary-mini-game-id-4' }),
  sequenceBuild({ id: 'temporary-mini-game-id-5', difficulty: 2 }),
  matchPairs({ id: 'temporary-mini-game-id-6' }),
  matchPairs({ id: 'temporary-mini-game-id-7', topicId: 'derivatives' }),
  matchPairs({ id: 'temporary-mini-game-id-8', difficulty: 4 }),
];

const parseJsonFailures = [
  `Here is the mini-game:\n${JSON.stringify({ card: acceptCards[0] })}`,
  `\`\`\`json\n${JSON.stringify({ card: acceptCards[0] })}\n\`\`\``,
  '{"card":',
  JSON.stringify({ card: acceptCards[0] }).replace(/}$/, ',}'),
  `${JSON.stringify({ card: acceptCards[0] })}\nextra`,
];

const zodFailures = [
  { cards: [acceptCards[0]] },
  { card: { ...acceptCards[0], id: '' } },
  { card: { ...acceptCards[0], topicId: 'Not Kebab' } },
  { card: { ...acceptCards[0], type: 'FLASHCARD' } },
  { card: { ...acceptCards[0], difficulty: 0 } },
  { card: { ...acceptCards[0], difficulty: 5 } },
  { card: { ...acceptCards[0], content: { gameType: 'UNKNOWN' } } },
  { card: { ...acceptCards[0], extra: true } },
];

const semanticFailures = [
  { card: categorySort({ content: { gameType: 'CATEGORY_SORT', categories: [{ id: 'a', label: 'A' }, { id: 'a', label: 'Again' }], items: [{ id: 'i', label: 'I', categoryId: 'a' }] } }) },
  { card: categorySort({ content: { gameType: 'CATEGORY_SORT', categories: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], items: [{ id: 'i', label: 'I', categoryId: 'missing' }] } }) },
  { card: sequenceBuild({ content: { gameType: 'SEQUENCE_BUILD', steps: [{ id: 's1', label: 'One', order: 1 }, { id: 's2', label: 'Three', order: 3 }] } }) },
  { card: matchPairs({ content: { gameType: 'MATCH_PAIRS', pairs: [{ id: 'same', left: 'A', right: 'B' }, { id: 'same', left: 'C', right: 'D' }] } }) },
];

export const topicMiniGameContentFixtures: ReadonlyArray<EvalFixture> = [
  ...acceptCards.map((item, index) => ({
    name: `accepts planned mini-game content ${index + 1}`,
    raw: JSON.stringify({ card: item }),
    expected: { outcome: 'accept' as const },
  })),
  ...parseJsonFailures.map((raw, index) => ({
    name: `rejects json-mode violation ${index + 1}`,
    raw,
    expected: { outcome: 'parse-fail' as const, failureCode: 'parse:json-mode-violation' as const },
  })),
  ...zodFailures.map((payload, index) => ({
    name: `rejects strict shape violation ${index + 1}`,
    raw: JSON.stringify(payload),
    expected: { outcome: 'parse-fail' as const, failureCode: 'parse:zod-shape' as const },
  })),
  ...semanticFailures.map((payload, index) => ({
    name: `rejects semantic playability violation ${index + 1}`,
    raw: JSON.stringify(payload),
    expected: { outcome: 'semantic-fail' as const, failureCode: 'validation:semantic-mini-game-playability' as const },
  })),
];
