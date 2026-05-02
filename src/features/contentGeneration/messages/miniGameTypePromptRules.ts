import type { MiniGameType } from '@/types/core';

/**
 * Canonical JSON examples and rejected shapes for a single mini-game type.
 * Kept in TypeScript so the prompt template stays short and version-controlled.
 */
export function buildMiniGameTypePromptRules(
  gameType: MiniGameType,
  topicId: string,
  targetDifficulty: string,
): string {
  const fill = (s: string) =>
    s.replace(/\{\{topicId\}\}/g, topicId).replace(/\{\{targetDifficulty\}\}/g, targetDifficulty);

  switch (gameType) {
    case 'CATEGORY_SORT':
      return fill(
        [
          '### CATEGORY_SORT — canonical minimal example',
          '',
          '```json',
          '{',
          '  "id": "{{topicId}}-mg-category-sort-1",',
          '  "type": "MINI_GAME",',
          '  "difficulty": {{targetDifficulty}},',
          '  "content": {',
          '    "gameType": "CATEGORY_SORT",',
          '    "prompt": "Sort each item into its category.",',
          '    "explanation": "Why these buckets fit the theory.",',
          '    "categories": [',
          '      { "id": "cat-0", "label": "Category A" },',
          '      { "id": "cat-1", "label": "Category B" },',
          '      { "id": "cat-2", "label": "Category C" }',
          '    ],',
          '    "items": [',
          '      { "id": "it-0", "label": "Item one", "categoryId": "cat-0" },',
          '      { "id": "it-1", "label": "Item two", "categoryId": "cat-0" },',
          '      { "id": "it-2", "label": "Item three", "categoryId": "cat-1" },',
          '      { "id": "it-3", "label": "Item four", "categoryId": "cat-1" },',
          '      { "id": "it-4", "label": "Item five", "categoryId": "cat-2" },',
          '      { "id": "it-5", "label": "Item six", "categoryId": "cat-2" }',
          '    ]',
          '  }',
          '}',
          '```',
          '',
          '**Hard rules**',
          '',
          '- `items` must be an array of **objects** with `id`, `label`, and `categoryId`. **Never** emit string entries in `items`.',
          '- Every `categoryId` must exactly match one `categories[].id`.',
          '- Every category MUST have at least one item — **never** declare a category that no item references.',
          '- Do not create a category unless at least one item uses its `categoryId`.',
          '- For difficulty 1, emit exactly **3** categories and exactly **6** items.',
          '- For difficulty 1, assign exactly **2** items to each category (two items per bucket).',
          '- Emit at least **3** categories and **6** items.',
          '',
          '### Rejected shape (do not emit)',
          '',
          '```json',
          '{ "gameType": "CATEGORY_SORT", "items": ["a", "b", "c", "d", "e", "f"] }',
          '```',
        ].join('\n'),
      );
    case 'SEQUENCE_BUILD':
      return fill(
        [
          '### SEQUENCE_BUILD — canonical minimal example',
          '',
          '```json',
          '{',
          '  "id": "{{topicId}}-mg-sequence-build-1",',
          '  "type": "MINI_GAME",',
          '  "difficulty": {{targetDifficulty}},',
          '  "content": {',
          '    "gameType": "SEQUENCE_BUILD",',
          '    "prompt": "Order these steps correctly.",',
          '    "explanation": "Why this order matches the theory.",',
          '    "items": [',
          '      { "id": "s-0", "label": "First step", "correctPosition": 0 },',
          '      { "id": "s-1", "label": "Second step", "correctPosition": 1 },',
          '      { "id": "s-2", "label": "Third step", "correctPosition": 2 }',
          '    ]',
          '  }',
          '}',
          '```',
          '',
          '**Hard rules**',
          '',
          '- `items` must be objects with `id`, `label`, and `correctPosition` (0-based). **Never** use a top-level `correctSequence` array.',
          '- `correctPosition` values must be contiguous **0 .. n-1**.',
          '- Emit at least **3** items.',
          '',
          '### Rejected shape (do not emit)',
          '',
          '```json',
          '{',
          '  "gameType": "SEQUENCE_BUILD",',
          '  "correctSequence": ["A", "B", "C"],',
          '  "items": ["C", "A", "B"]',
          '}',
          '```',
        ].join('\n'),
      );
    case 'MATCH_PAIRS':
      return fill(
        [
          '### MATCH_PAIRS — canonical minimal example',
          '',
          '```json',
          '{',
          '  "id": "{{topicId}}-mg-match-pairs-1",',
          '  "type": "MINI_GAME",',
          '  "difficulty": {{targetDifficulty}},',
          '  "content": {',
          '    "gameType": "MATCH_PAIRS",',
          '    "prompt": "Match each left concept to the correct right concept.",',
          '    "explanation": "Why each pairing is grounded in the theory.",',
          '    "pairs": [',
          '      { "id": "p-0", "left": "Term A", "right": "Definition A" },',
          '      { "id": "p-1", "left": "Term B", "right": "Definition B" },',
          '      { "id": "p-2", "left": "Term C", "right": "Definition C" }',
          '    ]',
          '  }',
          '}',
          '```',
          '',
          '**Hard rules**',
          '',
          '- Each pair must be an object with `id`, `left`, and `right`.',
          '- Emit at least **3** pairs.',
          '',
        ].join('\n'),
      );
    default: {
      const _exhaustive: never = gameType;
      return _exhaustive;
    }
  }
}
