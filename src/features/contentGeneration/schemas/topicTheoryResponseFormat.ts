import type { ChatResponseFormatJsonSchema } from '@/types/llm';

/**
 * OpenRouter / OpenAI-style structured output for `topic-theory`.
 * Authoritative validation remains {@link parseTopicTheoryPayload}; this schema
 * tightens generation only (cannot express every Zod cross-field rule).
 */
const categoryRowSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label'],
  properties: {
    id: { type: 'string', minLength: 1 },
    label: { type: 'string', minLength: 1 },
  },
};

const categorySetItemSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'categoryId'],
  properties: {
    id: { type: 'string', minLength: 1 },
    label: { type: 'string', minLength: 1 },
    categoryId: { type: 'string', minLength: 1 },
  },
};

const categorySetSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'categories', 'items'],
  properties: {
    label: { type: 'string', minLength: 1 },
    categories: {
      type: 'array',
      minItems: 3,
      items: categoryRowSchema,
    },
    items: {
      type: 'array',
      minItems: 6,
      items: categorySetItemSchema,
    },
  },
};

const sequenceItemSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'correctPosition'],
  properties: {
    id: { type: 'string', minLength: 1 },
    label: { type: 'string', minLength: 1 },
    correctPosition: { type: 'integer', minimum: 0 },
  },
};

const orderedSequenceSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'items'],
  properties: {
    label: { type: 'string', minLength: 1 },
    items: {
      type: 'array',
      minItems: 3,
      items: sequenceItemSchema,
    },
  },
};

const connectionPairSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'left', 'right'],
  properties: {
    id: { type: 'string', minLength: 1 },
    left: { type: 'string', minLength: 1 },
    right: { type: 'string', minLength: 1 },
  },
};

const connectionPairsSetSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'pairs'],
  properties: {
    label: { type: 'string', minLength: 1 },
    pairs: {
      type: 'array',
      minItems: 3,
      items: connectionPairSchema,
    },
  },
};

const tierQuestionsSchema: Record<string, unknown> = {
  type: 'array',
  minItems: 2,
  maxItems: 4,
  items: { type: 'string', minLength: 1 },
};

const topicTheoryRootSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['coreConcept', 'theory', 'keyTakeaways', 'coreQuestionsByDifficulty', 'miniGameAffordances'],
  properties: {
    coreConcept: { type: 'string', minLength: 1 },
    theory: { type: 'string', minLength: 1 },
    keyTakeaways: {
      type: 'array',
      minItems: 4,
      maxItems: 6,
      items: { type: 'string', minLength: 1 },
    },
    coreQuestionsByDifficulty: {
      type: 'object',
      additionalProperties: false,
      required: ['1', '2', '3', '4'],
      properties: {
        '1': tierQuestionsSchema,
        '2': tierQuestionsSchema,
        '3': tierQuestionsSchema,
        '4': tierQuestionsSchema,
      },
    },
    miniGameAffordances: {
      type: 'object',
      additionalProperties: false,
      required: ['categorySets', 'orderedSequences', 'connectionPairs'],
      properties: {
        categorySets: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: categorySetSchema,
        },
        orderedSequences: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: orderedSequenceSchema,
        },
        connectionPairs: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: connectionPairsSetSchema,
        },
      },
    },
  },
};

export const topicTheoryStructuredOutputResponseFormat: ChatResponseFormatJsonSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'topic_theory_syllabus',
    strict: true,
    schema: topicTheoryRootSchema,
  },
};
