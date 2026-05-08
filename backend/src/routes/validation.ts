/**
 * Route validation seam for backend HTTP inputs.
 *
 * Routes should validate request bodies, params, and query strings here before
 * invoking repositories or workflow/domain modules. The schemas fail loudly at
 * the Worker boundary; they do not repair, coerce ambiguous shapes, or accept
 * client-owned generation policy fields.
 */

import { z } from 'zod';
import type { PipelineKind } from '../repositories/types';
import type { RetryOptions } from './retryPlanning';

const PIPELINE_KIND_VALUES = [
  'crystal-trial',
  'topic-content',
  'topic-expansion',
  'subject-graph',
] as const satisfies readonly PipelineKind[];

/** Mirrors `RunListQuery.status` in shared contracts (`src/types/repository.ts`). */
const RUN_LIST_STATUS_VALUES = ['active', 'recent', 'all'] as const;

const pipelineKindSchema = z.enum(PIPELINE_KIND_VALUES);

const nonEmptyRouteString = z.string().min(1);

const positiveIntegerPathParam = z
  .string()
  .regex(/^\d+$/, 'must be a positive integer')
  .transform((value) => Number(value))
  .refine((value) => Number.isSafeInteger(value) && value > 0, 'must be a positive integer');

const exactNonEmptyQueryString = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, 'must not contain leading or trailing whitespace');

const eventSequenceParam = z
  .string()
  .regex(/^\d+$/, 'must be a non-negative integer')
  .transform((value) => Number(value))
  .refine((value) => Number.isSafeInteger(value) && value >= 0, 'must be a non-negative integer');

const statsDaysQuerySchema = z
  .string()
  .regex(/^\d+$/, 'must be an integer between 1 and 90')
  .transform((value) => Number(value))
  .refine((value) => Number.isSafeInteger(value) && value >= 1 && value <= 90, 'must be an integer between 1 and 90')
  .optional();

const optionalRouteQueryString = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, 'must not contain leading or trailing whitespace')
  .optional();

const limitQuerySchema = z
  .string()
  .regex(/^\d+$/, 'must be an integer between 1 and 500')
  .transform((value) => Number(value))
  .refine((value) => Number.isSafeInteger(value) && value >= 1 && value <= 500, 'must be an integer between 1 and 500')
  .optional();

const submitRunBodySchema = z.strictObject({
  kind: pipelineKindSchema,
  intent: z.record(z.string(), z.unknown()),
});

const retryBodySchema = z.strictObject({
  stage: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
});

const runsListQuerySchema = z.strictObject({
  status: z.enum(RUN_LIST_STATUS_VALUES).optional(),
  kind: pipelineKindSchema.optional(),
  subjectId: optionalRouteQueryString,
  topicId: optionalRouteQueryString,
  limit: limitQuerySchema,
});

const crystalTrialReadSchema = z.strictObject({
  subjectId: nonEmptyRouteString,
  topicId: nonEmptyRouteString,
  targetLevel: positiveIntegerPathParam,
  cardPoolHash: exactNonEmptyQueryString,
});

const runIdRouteSchema = z.strictObject({
  runId: exactNonEmptyQueryString,
});

const artifactReadSchema = z.strictObject({
  artifactId: exactNonEmptyQueryString,
});

const runEventsReadSchema = z.strictObject({
  runId: exactNonEmptyQueryString,
  lastEventId: eventSequenceParam.optional(),
  lastSeq: eventSequenceParam.optional(),
}).refine(
  (value) => value.lastEventId === undefined || value.lastSeq === undefined || value.lastEventId === value.lastSeq,
  { path: ['lastSeq'], message: 'must match Last-Event-ID when both resume cursors are provided' },
).transform((value) => ({
  runId: value.runId,
  lastSeq: value.lastEventId ?? value.lastSeq ?? 0,
}));

const failureStatsQuerySchema = z.strictObject({
  days: statsDaysQuerySchema,
  pipelineKind: pipelineKindSchema.optional(),
  model: optionalRouteQueryString,
  failureCode: optionalRouteQueryString,
}).transform((value) => ({
  days: value.days ?? 7,
  pipelineKind: value.pipelineKind,
  model: value.model,
  failureCode: value.failureCode,
}));

export interface ValidationFailure {
  code: string;
  message: string;
}

export interface ValidatedSubmitRunBody {
  kind: PipelineKind;
  intent: Record<string, unknown>;
}

export interface ValidatedRunsListQuery {
  status?: 'active' | 'recent' | 'all';
  kind?: PipelineKind;
  subjectId?: string;
  topicId?: string;
  limit?: number;
}

export interface ValidatedCrystalTrialReadInput {
  subjectId: string;
  topicId: string;
  targetLevel: number;
  cardPoolHash: string;
}

export interface ValidatedRunIdRouteInput {
  runId: string;
}

export interface ValidatedArtifactReadInput {
  artifactId: string;
}

export interface ValidatedRunEventsReadInput {
  runId: string;
  lastSeq: number;
}

export interface ValidatedFailureStatsQuery {
  days: number;
  pipelineKind?: PipelineKind;
  model?: string;
  failureCode?: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: ValidationFailure };

function formatIssues(issues: z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'body';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

function fromSafeParse<T>(
  parsed: z.ZodSafeParseResult<T>,
  code: string,
  fallbackMessage: string,
): ValidationResult<T> {
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    failure: {
      code,
      message: formatIssues(parsed.error.issues) || fallbackMessage,
    },
  };
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function validateSubmitRunBody(body: unknown): ValidationResult<ValidatedSubmitRunBody> {
  if (!isRecordLike(body)) {
    return { ok: false, failure: { code: 'parse:json-mode-violation', message: 'body must be an object' } };
  }

  if ('snapshot' in body) {
    return {
      ok: false,
      failure: {
        code: 'parse:json-mode-violation',
        message: 'snapshot is not accepted; POST /v1/runs requires { kind, intent }',
      },
    };
  }

  return fromSafeParse(
    submitRunBodySchema.safeParse(body),
    'parse:json-mode-violation',
    'POST /v1/runs requires { kind, intent }',
  );
}

export function validateRunsListQuery(query: Record<string, string | undefined>): ValidationResult<ValidatedRunsListQuery> {
  return fromSafeParse(
    runsListQuerySchema.safeParse(query),
    'parse:invalid-query',
    'invalid run list query',
  );
}

export function validateRetryBody(body: unknown): ValidationResult<RetryOptions> {
  if (!isRecordLike(body)) {
    return { ok: false, failure: { code: 'parse:json-mode-violation', message: 'retry body must be an object when provided' } };
  }

  return fromSafeParse(
    retryBodySchema.safeParse(body),
    'parse:json-mode-violation',
    'retry body must contain optional string stage/jobId fields only',
  );
}

export function validateCrystalTrialReadInput(input: Record<string, string | undefined>): ValidationResult<ValidatedCrystalTrialReadInput> {
  return fromSafeParse(
    crystalTrialReadSchema.safeParse(input),
    'parse:invalid-route-input',
    'invalid Crystal Trial route input',
  );
}

export function validateRunIdRouteInput(input: Record<string, string | undefined>): ValidationResult<ValidatedRunIdRouteInput> {
  return fromSafeParse(
    runIdRouteSchema.safeParse(input),
    'parse:invalid-route-input',
    'invalid run route input',
  );
}

export function validateRunEventsReadInput(input: Record<string, string | undefined>): ValidationResult<ValidatedRunEventsReadInput> {
  return fromSafeParse(
    runEventsReadSchema.safeParse(input),
    'parse:invalid-route-input',
    'invalid run events route input',
  );
}

export function validateArtifactReadInput(input: Record<string, string | undefined>): ValidationResult<ValidatedArtifactReadInput> {
  return fromSafeParse(
    artifactReadSchema.safeParse(input),
    'parse:invalid-route-input',
    'invalid artifact route input',
  );
}

export function validateFailureStatsQuery(input: Record<string, string | undefined>): ValidationResult<ValidatedFailureStatsQuery> {
  return fromSafeParse(
    failureStatsQuerySchema.safeParse(input),
    'parse:invalid-query',
    'invalid failure stats query',
  );
}
