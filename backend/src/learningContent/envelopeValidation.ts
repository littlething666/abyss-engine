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

export interface TopicCardEnvelopeInvariants {
  cardId: string;
  conceptId: string;
  cardSpecId?: string | null;
  miniGameSpecId?: string | null;
  questionSignature: string;
}

export function validateTopicCardEnvelope(value: unknown, invariants: TopicCardEnvelopeInvariants, columnName = 'topic_cards.card_json'): JsonObject {
  const card = parseEnvelope(topicCardEnvelopeSchema, value, columnName) as JsonObject;
  if (card.id !== invariants.cardId) {
    throw new WorkflowFail('validation:lcs-envelope', `invalid Learning Content Store ${columnName}: id must match card_id ${invariants.cardId}`);
  }
  if (card.conceptId !== invariants.conceptId) {
    throw new WorkflowFail('validation:lcs-envelope', `invalid Learning Content Store ${columnName}: conceptId must match concept_id ${invariants.conceptId}`);
  }
  if (card.questionSignature !== invariants.questionSignature) {
    throw new WorkflowFail('validation:lcs-envelope', `invalid Learning Content Store ${columnName}: questionSignature must match question_signature ${invariants.questionSignature}`);
  }
  if (invariants.cardSpecId && card.cardSpecId !== invariants.cardSpecId) {
    throw new WorkflowFail('validation:lcs-envelope', `invalid Learning Content Store ${columnName}: cardSpecId must match card_spec_id ${invariants.cardSpecId}`);
  }
  if (invariants.miniGameSpecId && card.miniGameSpecId !== invariants.miniGameSpecId) {
    throw new WorkflowFail('validation:lcs-envelope', `invalid Learning Content Store ${columnName}: miniGameSpecId must match mini_game_spec_id ${invariants.miniGameSpecId}`);
  }
  return card;
}

export function validateTopicCardRowInvariants(difficulty: number, sourceArtifactKind: string, questionSignature?: string, columnName = 'topic_cards'): void {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    throw new WorkflowFail('validation:lcs-envelope', `invalid Learning Content Store ${columnName}: difficulty must be an integer from 1 to 5`);
  }
  parseEnvelope(sourceArtifactKindSchema, sourceArtifactKind, `${columnName}.source_artifact_kind`);
  if (questionSignature !== undefined && (typeof questionSignature !== 'string' || questionSignature.trim().length === 0)) {
    throw new WorkflowFail('validation:lcs-envelope', `invalid Learning Content Store ${columnName}: question_signature must be a non-empty string`);
  }
}


export function validateCrystalTrialQuestionsEnvelope(value: unknown, columnName = 'crystal_trial_sets.questions_json'): JsonObject {
  return parseEnvelope(crystalTrialQuestionsEnvelopeSchema, value, columnName) as JsonObject;
}
