import type { EvalFixture } from './types';

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: 'temporary-card-id',
    topicId: 'limits',
    type: 'FLASHCARD',
    difficulty: 2,
    content: { front: 'What is a limit?', back: 'The value a function approaches as input approaches a point.' },
    ...overrides,
  };
}

const acceptCards = [
  card({ id: 'temporary-card-id-1' }),
  card({ id: 'temporary-card-id-2', difficulty: 1 }),
  card({ id: 'temporary-card-id-3', difficulty: 3 }),
  card({ id: 'temporary-card-id-4', difficulty: 4 }),
  card({ id: 'temporary-card-id-5', content: { front: 'State the epsilon intuition.', back: 'Outputs can be kept arbitrarily close by choosing inputs close enough.' } }),
  card({ id: 'temporary-card-id-6', type: 'MULTIPLE_CHOICE', content: { question: 'Which phrase describes a limit?', options: ['approached value', 'random value', 'largest value'], correctAnswer: 'approached value' } }),
  card({ id: 'temporary-card-id-7', type: 'MULTIPLE_CHOICE', difficulty: 3, content: { question: 'What must a correct limit explanation mention?', options: ['approach behavior', 'color', 'file size'], correctAnswer: 'approach behavior' } }),
  card({ id: 'temporary-card-id-8', topicId: 'derivatives', content: { front: 'What does derivative notation measure?', back: 'Instantaneous rate of change.' } }),
];

const parseJsonFailures = [
  `Here is the card:\n${JSON.stringify({ card: acceptCards[0] })}`,
  `\`\`\`json\n${JSON.stringify({ card: acceptCards[0] })}\n\`\`\``,
  '{"card":',
  JSON.stringify({ card: acceptCards[0] }).replace(/}$/, ',}'),
  `${JSON.stringify({ card: acceptCards[0] })}\nextra`,
];

const zodFailures = [
  { cards: [acceptCards[0]] },
  { card: { ...acceptCards[0], id: '' } },
  { card: { ...acceptCards[0], topicId: 'Not Kebab' } },
  { card: { ...acceptCards[0], type: 'MINI_GAME' } },
  { card: { ...acceptCards[0], difficulty: 0 } },
  { card: { ...acceptCards[0], difficulty: 5 } },
  { card: { ...acceptCards[0], content: [] } },
  { card: { ...acceptCards[0], extra: true } },
];

const semanticFailures = [
  { card: { ...acceptCards[0], content: { prompt: 'bad', answer: 'bad' } } },
  { card: { ...acceptCards[5], content: { question: '', options: ['A'], correctAnswer: 'A', explanation: 'bad' } } },
  { card: { ...acceptCards[5], content: { question: 'Pick one', options: ['A'], correctAnswer: 'B', explanation: 'bad' } } },
  { card: { ...acceptCards[5], content: { question: 'Pick one', options: ['A'], correctAnswers: [], explanation: 'bad' } } },
  { card: card({ type: 'CLOZE', content: { text: 'A limit is [approach].', blanks: ['approach'] } }) },
];

export const topicCardContentFixtures: ReadonlyArray<EvalFixture> = [
  ...acceptCards.map((item, index) => ({
    name: `accepts planned card content ${index + 1}`,
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
    name: `rejects semantic content violation ${index + 1}`,
    raw: JSON.stringify(payload),
    expected: { outcome: 'semantic-fail' as const, failureCode: 'validation:semantic-card-content-shape' as const },
  })),
];
