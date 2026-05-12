/**
 * Topic Expansion Workflow — Phase 2 PR-2B / Phase 3.6.
 *
 * Single-stage durable pipeline: generate → parse → validate → persist.
 * Mirrors `runExpansionJob.ts` but runs server-side on Cloudflare Workflows
 * with strict json_schema from the contracts module and cooperative cancel.
 *
 * Phase 3.6: Typed event
 * builders and transport statuses throughout.
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { makeRepos } from '../repositories';
import { WorkflowFail, WorkflowAbort, toWorkflowStepError, workflowFailureDetails } from '../lib/workflowErrors';
import { callTopicExpansion } from '../llm/llmClient';
import { traceLlmCall, recordLlmJob } from './shared/workflowObservability';
import {
  WORKFLOW_LLM_STEP_RETRY,
  WORKFLOW_STORAGE_STEP_RETRY,
  WORKFLOW_TERMINAL_STEP_RETRY,
  appendWorkflowEventOnce,
  workflowArtifactReadyEventKey,
  workflowStatusEventKey,
  workflowTerminalEventKey,
} from './shared/workflowDurability';
import { classifyWorkflowTerminalError } from './shared/workflowFailureClassification';
import { resolveGenerationJobPolicy } from '../generationPolicy';
import { buildTopicExpansionMessages } from '../prompts/generationPrompts';
import { applyArtifactToLearningContent } from '../learningContent/artifactApplication';
import {
  inputHash,
  contentHash,
  strictParseArtifact,
  semanticValidateArtifact,
  jsonSchemaResponseFormat,
  topicExpansionCardsSchemaVersion,
} from '../contracts/generationContracts';
import {
  buildRunStatusEvent,
  buildArtifactReadyEvent,
  buildRunCompletedEvent,
  buildRunFailedEvent,
  buildRunCancelledEvent,
} from '../contracts/typedEvents';
import type { Env } from '../env';
import { createLogger } from '../observability/logger';
import { writeRunDebugBundle } from '../observability/debugBundle';

// ---------------------------------------------------------------------------
// Step return shapes
// ---------------------------------------------------------------------------
interface CachedArtifactResult {
  artifactId: string;
  contentHash: string;
  inputHash: string;
  schemaVersion: number;
  storageKey: string;
}
interface PlanOutcomeOk { ok: true; snapshot: Record<string, unknown>; inputHash: string }
interface PlanOutcomeCached { ok: false; snapshot: Record<string, unknown>; cached: CachedArtifactResult }
type PlanOutcome = PlanOutcomeOk | PlanOutcomeCached;

interface GenerateResult {
  text: string;
}

interface ValidatedGenerateResult extends GenerateResult {
  parsedPayload: Record<string, unknown>;
}

interface PersistResult { artifactId: string; contentHash: string }

function requireArtifactPayload(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------
export class TopicExpansionWorkflow extends WorkflowEntrypoint<
  Env,
  { runId: string; deviceId: string }
> {
  async run(
    event: WorkflowEvent<{ runId: string; deviceId: string }>,
    step: WorkflowStep,
  ): Promise<void> {
    const { runId, deviceId } = event.payload;
    const repos = makeRepos(this.env);
    const logger = createLogger({ runId, deviceId, pipelineKind: 'topic-expansion', workflowName: 'topic-expansion-workflow' });
    logger.info('workflow.start');

    const checkCancel = async (boundary: string) => {
      const reason = await repos.runs.cancelRequested(runId);
      if (reason) {
        await step.do(`cancel:${boundary}`, WORKFLOW_TERMINAL_STEP_RETRY, async () => {
          logger.info('workflow.terminal.cancelled', { stage: boundary, reason });
          await repos.runs.markCancelled(runId);
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('cancelled'),
            buildRunCancelledEvent(boundary, reason),
          );
        });
        throw new WorkflowAbort('cancelled');
      }
    };

    try {
      // ---- 1. PLAN (no budget check — Phase 3.6 Step 4) ----
      await checkCancel('before-plan');

      // @ts-expect-error Workflow Serializable cannot express JSON objects parsed from D1 snapshots.
      const planOutcome = (await step.do('plan', async (): Promise<PlanOutcome> => {
        await repos.runs.transition(runId, 'planning');
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStatusEventKey('planning'),
          buildRunStatusEvent('planning'),
        );

        const run = await repos.runs.load(runId);
        const snapshot = run.snapshot_json as Record<string, unknown>;
        const _inputHash = await inputHash(snapshot);

        const cached = await repos.artifacts.findCacheHit(deviceId, 'topic-expansion-cards', _inputHash);
        if (cached) {
          return {
            ok: false,
            snapshot,
            cached: {
              artifactId: cached.id,
              contentHash: cached.content_hash,
              inputHash: _inputHash,
              schemaVersion: cached.schema_version,
              storageKey: cached.storage_key,
            },
          };
        }

        return { ok: true, snapshot, inputHash: _inputHash };
      })) as PlanOutcome;

      if (!planOutcome.ok) {
        const { snapshot, cached } = planOutcome;
        await step.do('apply:topic-expansion-cards:cache', WORKFLOW_STORAGE_STEP_RETRY, async () => {
          const payload = requireArtifactPayload(
            await repos.artifacts.getStorage(cached.storageKey),
            `cached topic-expansion-cards artifact ${cached.artifactId}`,
          );
          await applyArtifactToLearningContent({
            learningContent: repos.learningContent,
            deviceId,
            runId,
            artifactKind: 'topic-expansion-cards',
            payload,
            snapshot,
            contentHash: cached.contentHash,
          });
        });
        await step.do('ready:topic-expansion-cards:cache', WORKFLOW_TERMINAL_STEP_RETRY, async () => {
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowArtifactReadyEventKey('topic-expansion-cards', cached.inputHash),
            buildArtifactReadyEvent({
              artifactId: cached.artifactId,
              kind: 'topic-expansion-cards',
              contentHash: cached.contentHash,
              inputHash: cached.inputHash,
              schemaVersion: cached.schemaVersion,
              fromCache: true,
            }),
          );
          await repos.runs.markReady(runId);
          logger.info('workflow.terminal.ready');
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('completed'), buildRunCompletedEvent());
        });
        return;
      }
      const { snapshot, inputHash: _inputHash } = planOutcome;
      const generationPolicy = await resolveGenerationJobPolicy(deviceId, 'topic-expansion-cards');

      // ---- 2. GENERATE ----
      await checkCancel('before-generate');

      const llmTrace = traceLlmCall({
        runId,
        deviceId,
        pipelineKind: 'topic-expansion',
        stage: 'generate',
        model: generationPolicy.modelId,
        generationPolicyHash: generationPolicy.generationPolicyHash,
        promptVersion: (snapshot.prompt_template_version as number) ?? 0,
        schemaVersion: (snapshot.schema_version as number) ?? topicExpansionCardsSchemaVersion,
        inputHash: _inputHash,
        providerHealingRequested: generationPolicy.providerHealingRequested,
      });

      const responseFormat = jsonSchemaResponseFormat('topic-expansion-cards');

      let genResult: ValidatedGenerateResult;
      try {
        const raw = (await step.do(
          'generate',
          WORKFLOW_LLM_STEP_RETRY,
          async (): Promise<GenerateResult> => {
            await repos.runs.transition(runId, 'generating_stage');
            await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStatusEventKey('generating_stage', 'generate'),
              buildRunStatusEvent('generating_stage'),
            );

            try {
              return await callTopicExpansion(
                {
                  modelId: generationPolicy.modelId,
                  messages: buildTopicExpansionMessages(snapshot),
                  responseFormat,
                  providerHealingRequested: generationPolicy.providerHealingRequested,
                },
                this.env,
              );
            } catch (err) {
              throw toWorkflowStepError(err);
            }
          },
        )) as GenerateResult;
        const trace = llmTrace.finalizeSuccess();
        await recordLlmJob({ repos, runId, pipelineKind: 'topic-expansion', stage: 'generate', inputHash: _inputHash, model: generationPolicy.modelId, status: 'success', trace });

        await step.do('status:parse', WORKFLOW_STORAGE_STEP_RETRY, async () => {
          await repos.runs.transition(runId, 'parsing');
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStatusEventKey('parsing', 'parse'),
            buildRunStatusEvent('parsing'),
          );
        });
        const parseResult = strictParseArtifact('topic-expansion-cards', raw.text);
        if (!parseResult.ok) {
          throw new WorkflowFail(parseResult.failureCode, parseResult.message);
        }

        await step.do('status:validate', WORKFLOW_STORAGE_STEP_RETRY, async () => {
          await repos.runs.transition(runId, 'validating');
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStatusEventKey('validating', 'validate'),
            buildRunStatusEvent('validating'),
          );
        });
        const existingStems = Array.isArray(snapshot.existing_concept_stems)
          ? (snapshot.existing_concept_stems as string[])
          : undefined;
        const ctx = existingStems ? { existingConceptStems: existingStems } : undefined;
        const result = semanticValidateArtifact('topic-expansion-cards', parseResult.payload, ctx);
        if (!result.ok) {
          throw new WorkflowFail(result.failureCode, result.message ?? 'semantic validation failed');
        }
        const parsedPayload = parseResult.payload as Record<string, unknown>;

        genResult = { ...raw, parsedPayload };
      } catch (err) {
        if (!llmTrace.trace.finishedAt) {
          const failure = workflowFailureDetails(err, 'llm:upstream-transient');
          const trace = llmTrace.finalizeFailure(failure.code, failure.message);
          await recordLlmJob({ repos, runId, pipelineKind: 'topic-expansion', stage: 'generate', inputHash: _inputHash, model: generationPolicy.modelId, status: 'failed', trace, errorCode: failure.code, errorMessage: failure.message });
        }
        throw err;
      }

      const parsed = genResult.parsedPayload;

      // ---- 3. PERSIST ----
      await checkCancel('before-persist');

      const persisted = (await step.do('persist', WORKFLOW_STORAGE_STEP_RETRY, async (): Promise<PersistResult> => {
        await repos.runs.transition(runId, 'persisting');
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStatusEventKey('persisting', 'persist'),
          buildRunStatusEvent('persisting'),
        );
        const _contentHash = await contentHash(parsed);

        const artifactId = await repos.artifacts.putStorage(
          { deviceId, kind: 'topic-expansion-cards', inputHash: _inputHash, payload: parsed },
          _contentHash,
          (snapshot.schema_version as number) ?? topicExpansionCardsSchemaVersion,
          runId,
        );

        return { artifactId, contentHash: _contentHash };
      })) as PersistResult;

      // ---- 4. APPLY + READY ----
      await step.do('apply:topic-expansion-cards', WORKFLOW_STORAGE_STEP_RETRY, async () => {
        await applyArtifactToLearningContent({
          learningContent: repos.learningContent,
          deviceId,
          runId,
          artifactKind: 'topic-expansion-cards',
          payload: parsed,
          snapshot,
          contentHash: persisted.contentHash,
        });
      });

      await step.do('ready:topic-expansion-cards', WORKFLOW_TERMINAL_STEP_RETRY, async () => {
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowArtifactReadyEventKey('topic-expansion-cards', _inputHash),
          buildArtifactReadyEvent({
            artifactId: persisted.artifactId,
            kind: 'topic-expansion-cards',
            contentHash: persisted.contentHash,
            inputHash: _inputHash,
            schemaVersion: (snapshot.schema_version as number) ?? topicExpansionCardsSchemaVersion,
          }),
        );
        await repos.runs.markReady(runId);
        logger.info('workflow.terminal.ready');
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('completed'), buildRunCompletedEvent());
      });
    } catch (err) {
      if (err instanceof WorkflowAbort) return;
      const failure = classifyWorkflowTerminalError(err);
      await step.do('fail', WORKFLOW_TERMINAL_STEP_RETRY, async () => {
        await repos.runs.markFailed(runId, failure.code, failure.message);
        logger.error('workflow.terminal.failed', { errorCode: failure.code, errorMessage: failure.message });
        await writeRunDebugBundle({ env: this.env, repos, runId, deviceId, failure, logger });
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('failed'),
          buildRunFailedEvent(failure.code, failure.message),
        );
      });
      throw failure.runtimeError;
    }
  }
}
