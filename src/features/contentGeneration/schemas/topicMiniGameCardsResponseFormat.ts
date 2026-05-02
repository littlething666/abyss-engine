import type { MiniGameType } from '@/types/core';
import type { ChatResponseFormatJsonSchema } from '@/types/llm';

const SCHEMA_NAMES: Record<MiniGameType, string> = {
  CATEGORY_SORT: 'topic_mini_game_category_sort_cards',
  SEQUENCE_BUILD: 'topic_mini_game_sequence_build_cards',
  MATCH_PAIRS: 'topic_mini_game_match_pairs_cards',
};

const categoryRowSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label'],
  properties: {
    id: {
      type: 'string',
      description: 'Stable id unique within this card; referenced by items.categoryId.',
    },
    label: { type: 'string', description: 'Non-empty display label for the category bucket.' },
  },
};

const categorySortItemSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'categoryId'],
  properties: {
    id: { type: 'string', description: 'Unique item id within this card.' },
    label: { type: 'string', description: 'Non-empty learner-facing item text.' },
    categoryId: {
      type: 'string',
      description: 'MUST exactly match a categories[].id. Every declared category id MUST appear on at least one item.',
    },
  },
};

const categorySortContentSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['gameType', 'prompt', 'explanation', 'categories', 'items'],
  properties: {
    gameType: {
      type: 'string',
      enum: ['CATEGORY_SORT'],
      description: 'MUST be CATEGORY_SORT for this job.',
    },
    prompt: { type: 'string', description: 'Non-empty learner-facing sort instruction.' },
    explanation: { type: 'string', description: 'Non-empty rationale grounded in the theory.' },
    categories: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      description:
        'Exactly 3 category objects for difficulty 1. Every category id MUST be referenced by at least one item.categoryId — do not declare unused categories.',
      items: categoryRowSchema,
    },
    items: {
      type: 'array',
      minItems: 6,
      maxItems: 6,
      description:
        'Exactly 6 item objects for difficulty 1. Prefer exactly 2 items per category. Every categoryId MUST exactly match a categories[].id.',
      items: categorySortItemSchema,
    },
  },
};

const sequenceItemSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'correctPosition'],
  properties: {
    id: { type: 'string', description: 'Unique sequence item id within this card.' },
    label: { type: 'string', description: 'Non-empty step text.' },
    correctPosition: {
      type: 'integer',
      description:
        'Zero-based position in the correct order. Values MUST be contiguous integers 0 .. n-1 with n equal to items.length.',
    },
  },
};

const sequenceBuildContentSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['gameType', 'prompt', 'explanation', 'items'],
  properties: {
    gameType: {
      type: 'string',
      enum: ['SEQUENCE_BUILD'],
      description: 'MUST be SEQUENCE_BUILD for this job.',
    },
    prompt: { type: 'string', description: 'Non-empty learner-facing ordering instruction.' },
    explanation: { type: 'string', description: 'Non-empty rationale for the correct order.' },
    items: {
      type: 'array',
      minItems: 3,
      description:
        'At least 3 sequence items. correctPosition MUST be contiguous 0 .. n-1 (one item per position).',
      items: sequenceItemSchema,
    },
  },
};

const matchPairsPairSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'left', 'right'],
  properties: {
    id: { type: 'string', description: 'Unique pair id within this card.' },
    left: { type: 'string', description: 'Non-empty left-column concept label.' },
    right: { type: 'string', description: 'Non-empty right-column concept label.' },
  },
};

const matchPairsContentSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['gameType', 'prompt', 'explanation', 'pairs'],
  properties: {
    gameType: {
      type: 'string',
      enum: ['MATCH_PAIRS'],
      description: 'MUST be MATCH_PAIRS for this job.',
    },
    prompt: { type: 'string', description: 'Non-empty learner-facing matching instruction.' },
    explanation: { type: 'string', description: 'Non-empty rationale for the correct pairings.' },
    pairs: {
      type: 'array',
      minItems: 3,
      description: 'At least 3 term/definition (left/right) pairs. Match Pairs is a strict 1:1 permutation — do not emit distractors.',
      items: matchPairsPairSchema,
    },
  },
};

function miniGameContentSchemaFor(gameType: MiniGameType): Record<string, unknown> {
  switch (gameType) {
    case 'CATEGORY_SORT':
      return categorySortContentSchema;
    case 'SEQUENCE_BUILD':
      return sequenceBuildContentSchema;
    case 'MATCH_PAIRS':
      return matchPairsContentSchema;
    default: {
      const _exhaustive: never = gameType;
      return _exhaustive;
    }
  }
}

function miniGameCardSchema(gameType: MiniGameType): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'type', 'difficulty', 'content'],
    properties: {
      id: {
        type: 'string',
        description: 'Kebab-case card id with the topic id prefix (e.g. topicId-mg-…).',
      },
      type: {
        type: 'string',
        enum: ['MINI_GAME'],
        description: 'MUST be MINI_GAME.',
      },
      difficulty: {
        type: 'integer',
        description: 'MUST equal the target difficulty integer from the system prompt (typically 1).',
      },
      content: miniGameContentSchemaFor(gameType),
    },
  };
}

function rootSchemaFor(gameType: MiniGameType): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['cards'],
    properties: {
      cards: {
        type: 'array',
        minItems: 1,
        maxItems: 1,
        description: 'MUST contain exactly one MINI_GAME card for the requested game type.',
        items: miniGameCardSchema(gameType),
      },
    },
  };
}

/**
 * OpenRouter / OpenAI-style structured output for per-type topic mini-game jobs.
 * Authoritative validation remains {@link parseTopicCardsPayload}; this schema
 * tightens generation only.
 */
export function buildTopicMiniGameCardsResponseFormat(gameType: MiniGameType): ChatResponseFormatJsonSchema {
  return {
    type: 'json_schema',
    json_schema: {
      name: SCHEMA_NAMES[gameType],
      strict: true,
      schema: rootSchemaFor(gameType),
    },
  };
}
