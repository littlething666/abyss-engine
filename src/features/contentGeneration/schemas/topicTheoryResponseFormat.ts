import type { ChatResponseFormatJsonSchema } from '@/types/llm';

/**
 * OpenRouter / OpenAI-style structured output for `topic-theory`.
 * Authoritative validation remains {@link parseTopicTheoryContentPayload}; this schema
 * tightens generation only (Zod remains the contract boundary).
 */
const tierQuestionsSchema: Record<string, unknown> = {
  type: 'array',
  description:
    'Two to four learner-facing question strings for this difficulty tier. MUST be non-empty strings.',
  items: {
    type: 'string',
    description: 'A single learner-facing question grounded in the theory.',
  },
};

const topicTheoryRootSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['coreConcept', 'theory', 'keyTakeaways', 'coreQuestionsByDifficulty'],
  properties: {
    coreConcept: {
      type: 'string',
      description: 'The core concept. MUST be non-empty and written as 2-3 clear sentences.',
    },
    theory: {
      type: 'string',
      description:
        'Markdown theory body with 3-5 sections and 600-900 words. MUST be non-empty.',
    },
    keyTakeaways: {
      type: 'array',
      description:
        'Four to six short takeaway strings. MUST include at least four non-empty strings.',
      items: {
        type: 'string',
        description: 'One concise takeaway string.',
      },
    },
    coreQuestionsByDifficulty: {
      type: 'object',
      additionalProperties: false,
      required: ['1', '2', '3', '4'],
      description:
        'Each tier key MUST be present with 2-4 distinct learner-facing questions grounded in the theory.',
      properties: {
        '1': tierQuestionsSchema,
        '2': tierQuestionsSchema,
        '3': tierQuestionsSchema,
        '4': tierQuestionsSchema,
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
