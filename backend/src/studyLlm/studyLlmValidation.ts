import type { StudyFormulaExplainContext, StudyLlmRequest } from './studyLlmTypes';

const FORBIDDEN_PROVIDER_FIELD_NAMES = new Set([
  'model',
  'modelId',
  'model_id',
  'provider',
  'messages',
  'response_format',
  'plugins',
  'tools',
  'reasoning',
  'includeProviderReasoning',
  'enableReasoning',
  'apiKey',
]);

const FORMULA_CONTEXTS = new Set<StudyFormulaExplainContext>(['question', 'answer', 'option']);

export class StudyLlmValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StudyLlmValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNoForbiddenProviderFields(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenProviderFields(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_PROVIDER_FIELD_NAMES.has(key)) {
      throw new StudyLlmValidationError(
        'provider_field_forbidden',
        `Study LLM request must not include provider/request-shape field '${key}' at ${childPath}`,
      );
    }
    assertNoForbiddenProviderFields(child, childPath);
  }
}

function requiredTrimmedString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new StudyLlmValidationError(
      'required_field_empty',
      `Study LLM request requires non-empty string '${path}.${key}'`,
    );
  }
  return value;
}

function assertExactKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  const extra = Object.keys(record).filter((key) => !allowedSet.has(key));
  if (extra.length > 0) {
    throw new StudyLlmValidationError(
      'unknown_field',
      `Study LLM request has unknown field '${path}.${extra[0]}'`,
    );
  }
}

export function validateStudyLlmRequest(body: unknown): StudyLlmRequest {
  assertNoForbiddenProviderFields(body);

  if (!isRecord(body)) {
    throw new StudyLlmValidationError('invalid_body', 'Study LLM request body must be a JSON object');
  }
  assertExactKeys(body, ['kind', 'intent'], '$');

  const kind = body.kind;
  if (kind !== 'study-question-explain' && kind !== 'study-formula-explain') {
    throw new StudyLlmValidationError('unknown_kind', 'Study LLM request kind is not supported');
  }
  if (!isRecord(body.intent)) {
    throw new StudyLlmValidationError('invalid_intent', 'Study LLM request intent must be a JSON object');
  }

  if (kind === 'study-question-explain') {
    assertExactKeys(body.intent, ['topicLabel', 'questionText', 'agentPersonality'], '$.intent');
    return {
      kind,
      intent: {
        topicLabel: requiredTrimmedString(body.intent, 'topicLabel', '$.intent'),
        questionText: requiredTrimmedString(body.intent, 'questionText', '$.intent'),
        agentPersonality: requiredTrimmedString(body.intent, 'agentPersonality', '$.intent'),
      },
    };
  }

  assertExactKeys(body.intent, ['topicLabel', 'cardQuestionText', 'latex', 'context'], '$.intent');
  const context = body.intent.context;
  if (typeof context !== 'string' || !FORMULA_CONTEXTS.has(context as StudyFormulaExplainContext)) {
    throw new StudyLlmValidationError(
      'invalid_context',
      "Study formula explanation context must be 'question', 'answer', or 'option'",
    );
  }

  return {
    kind,
    intent: {
      topicLabel: requiredTrimmedString(body.intent, 'topicLabel', '$.intent'),
      cardQuestionText: requiredTrimmedString(body.intent, 'cardQuestionText', '$.intent'),
      latex: requiredTrimmedString(body.intent, 'latex', '$.intent'),
      context: context as StudyFormulaExplainContext,
    },
  };
}
