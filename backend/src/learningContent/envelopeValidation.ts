import { z } from 'zod';
import { WorkflowFail } from '../lib/workflowErrors';
import type { JsonObject } from './types';
import {
  crystalTrialQuestionsEnvelopeSchema,
  sourceArtifactKindSchema,
  subjectGraphEnvelopeSchema,
  subjectMetadataEnvelopeSchema,
  topicCardEnvelopeSchema,
  topicDetailsEnvelopeSchema,
} from './envelopeSchemas';

function summarizeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `${path}: ${issue.message}`;
  }).join('; ');
}

function parseEnvelope<T>(schema: z.ZodType<T>, value: unknown, columnName: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new WorkflowFail(
    'validation:lcs-envelope',
    `invalid Learning Content Store ${columnName}: ${summarizeIssues(parsed.error)}`,
  );
}

export function validateSubjectMetadataEnvelope(value: unknown, columnName = 'subjects.metadata_json'): JsonObject {
  return parseEnvelope(subjectMetadataEnvelopeSchema, value, columnName) as JsonObject;
}

export function validateSubjectGraphEnvelope(value: unknown, columnName = 'subject_graphs.graph_json'): JsonObject {
  return parseEnvelope(subjectGraphEnvelopeSchema, value, columnName) as JsonObject;
}

export function validateTopicDetailsEnvelope(value: unknown, columnName = 'topic_contents.details_json'): JsonObject {
  return parseEnvelope(topicDetailsEnvelopeSchema, value, columnName) as JsonObject;
}

export function validateTopicCardEnvelope(value: unknown, cardId: string, columnName = 'topic_cards.card_json'): JsonObject {
  const card = parseEnvelope(topicCardEnvelopeSchema, value, columnName) as JsonObject;
  if (card.id !== cardId) {
    throw new WorkflowFail('validation:lcs-envelope', `invalid Learning Content Store ${columnName}: id must match card_id ${cardId}`);
  }
  return card;
}

export function validateTopicCardRowInvariants(difficulty: number, sourceArtifactKind: string, columnName = 'topic_cards'): void {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    throw new WorkflowFail('validation:lcs-envelope', `invalid Learning Content Store ${columnName}: difficulty must be an integer from 1 to 5`);
  }
  parseEnvelope(sourceArtifactKindSchema, sourceArtifactKind, `${columnName}.source_artifact_kind`);
}

export function validateCrystalTrialQuestionsEnvelope(value: unknown, columnName = 'crystal_trial_sets.questions_json'): JsonObject {
  return parseEnvelope(crystalTrialQuestionsEnvelopeSchema, value, columnName) as JsonObject;
}
