/**
 * Crystal Trial Workflow — Phase 1 PR-D / Phase 3.6.
 *
 * Six orchestrated steps executed durably on Cloudflare Workflows:
 *   1. plan      — validate snapshot, cache-hit check (budget reserved at route)
 *   2. generate  — OpenRouter call with strict json_schema (retries: 2)
 *   3. parse     — strictParseArtifact('crystal-trial', raw) via contracts
 *   4. validate  — semanticValidateArtifact('crystal-trial', payload, ctx)
 *   5. persist   — contentHash(payload), R2 put + artifacts upsert
 *   6. ready     — typed artifact.ready event + token accounting
 *
 * Phase 3.6: Budget is reserved at the route level (single owner).
 * Workflows use typed event builders and transport statuses.
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { makeRepos } from '../repositories';
import { WorkflowFail, WorkflowAbort, toWorkflowRuntimeError } from '../lib/workflowErrors';
import { callCrystalTrial } from '../llm/openrouterClient';
import { traceLlmCall, recordTokensRobust } from './shared/workflowObservability';
import {
  WORKFLOW_LLM_STEP_RETRY,
  WORKFLOW_STORAGE_STEP_RETRY,
  WORKFLOW_TERMINAL_STEP_RETRY,
  appendWorkflowEventOnce,
  workflowArtifactReadyEventKey,
  workflowStatusEventKey,
  workflowTerminalEventKey,
} from './shared/workflowDurability';
import { resolveGenerationJobPolicy } from '../generationPolicy';
import { buildCrystalTrialMessages } from '../prompts/generationPrompts';
import { applyArtifactToLearningContent } from '../learningContent/artifactApplication';
import {
  inputHash,
  contentHash,
  strictParseArtifact,
  semanticValidateArtifact,
  jsonSchemaResponseFormat,
  crystalTrialSchemaVersion,
} from '../contracts/generationContracts';
import {
  buildRunStatusEvent,
  buildArtifactReadyEvent,
  buildRunCompletedEvent,
  buildRunFailedEvent,
  buildRunCancelledEvent,
} from '../contracts/typedEvents';
import type { Env } from '../env';

// ---------------------------------------------------------------------------
// Step return shapes (all JSON-serializable at runtime).
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
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
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
export class CrystalTrialWorkflow extends WorkflowEntrypoint<Env, { runId: string; deviceId: string }> {
  async run(
    event: WorkflowEvent<{ runId: string; deviceId: string }>,
    step: WorkflowStep,
  ): Promise<void> {
    const { runId, deviceId } = event.payload;
    const repos = makeRepos(this.env);

    const checkCancel = async (boundary: string) => {
      const reason = await repos.runs.cancelRequested(runId);
      if (reason) {
        await step.do(`cancel:${boundary}`, WORKFLOW_TERMINAL_STEP_RETRY, async () => {
          await repos.runs.markCancelled(runId);
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('cancelled'),
            buildRunCancelledEvent(boundary, reason),
          );
        });
        throw new WorkflowAbort('cancelled');
      }
    };

    try {
      // ---- 1. PLAN (no budget check — reserved at route level, Phase 3.6 Step 4) ----
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

        // Cache-hit short-circuit.
        const cached = await repos.artifacts.findCacheHit(deviceId, 'crystal-trial', _inputHash);
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
        await step.do('apply:crystal-trial:cache', WORKFLOW_STORAGE_STEP_RETRY, async () => {
          const payload = requireArtifactPayload(
            await repos.artifacts.getStorage(cached.storageKey),
            `cached crystal-trial artifact ${cached.artifactId}`,
          );
          await applyArtifactToLearningContent({
            learningContent: repos.learningContent,
            deviceId,
            runId,
            artifactKind: 'crystal-trial',
            payload,
            snapshot,
            contentHash: cached.contentHash,
          });
        });
        await step.do('ready:crystal-trial:cache', WORKFLOW_TERMINAL_STEP_RETRY, async () => {
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowArtifactReadyEventKey('crystal-trial', cached.inputHash),
            buildArtifactReadyEvent({
              artifactId: cached.artifactId,
              kind: 'crystal-trial',
              contentHash: cached.contentHash,
              inputHash: cached.inputHash,
              schemaVersion: cached.schemaVersion,
              fromCache: true,
            }),
          );
          await repos.runs.markReady(runId);
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('completed'), buildRunCompletedEvent());
        });
        return;
      }
      const { snapshot, inputHash: _inputHash } = planOutcome;
      const generationPolicy = await resolveGenerationJobPolicy(deviceId, 'crystal-trial');

      // ---- 2. GENERATE — retries: 2, 5s delay, exponential ----
      await checkCancel('before-generate');

      const llmTrace = traceLlmCall({
        runId,
        deviceId,
        pipelineKind: 'crystal-trial',
        stage: 'generate',
        model: generationPolicy.modelId,
        generationPolicyHash: generationPolicy.generationPolicyHash,
        promptVersion: (snapshot.prompt_template_version as number) ?? 0,
        schemaVersion: (snapshot.schema_version as number) ?? crystalTrialSchemaVersion,
        inputHash: _inputHash,
        providerHealingRequested: generationPolicy.providerHealingRequested,
      });

      const responseFormat = jsonSchemaResponseFormat('crystal-trial');

      let genResult: ValidatedGenerateResult;
      try {
        genResult = (await step.do(
          'generate:validated',
          WORKFLOW_LLM_STEP_RETRY,
          // @ts-expect-error parsed JSON payload is serializable at runtime but typed as Record<string, unknown>.
          async (): Promise<ValidatedGenerateResult> => {
            await repos.runs.transition(runId, 'generating_stage');
            await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStatusEventKey('generating_stage', 'generate'),
              buildRunStatusEvent('generating_stage'),
            );

            const raw = await callCrystalTrial(
              {
                modelId: generationPolicy.modelId,
                messages: buildCrystalTrialMessages(snapshot),
                responseFormat,
                providerHealingRequested: generationPolicy.providerHealingRequested,
              },
              this.env,
            );

            await repos.runs.transition(runId, 'parsing');
            await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStatusEventKey('parsing', 'parse'),
              buildRunStatusEvent('parsing'),
            );
            const parseResult = strictParseArtifact('crystal-trial', raw.text);
            if (!parseResult.ok) {
              throw new WorkflowFail(parseResult.failureCode, parseResult.message);
            }

            await repos.runs.transition(runId, 'validating');
            await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStatusEventKey('validating', 'validate'),
              buildRunStatusEvent('validating'),
            );
            const expectedQuestionCount = snapshot.question_count as number | undefined;
            const ctx = expectedQuestionCount !== undefined
              ? { expectedQuestionCount }
              : undefined;
            const result = semanticValidateArtifact('crystal-trial', parseResult.payload, ctx);
            if (!result.ok) {
              throw new WorkflowFail(result.failureCode, result.message ?? 'semantic validation failed');
            }

            return { ...raw, parsedPayload: parseResult.payload as Record<string, unknown> };
          },
        )) as ValidatedGenerateResult;
        llmTrace.finalizeSuccess(genResult.usage);
      } catch (err) {
        if (err instanceof WorkflowFail) {
          llmTrace.finalizeFailure(err.code, err.message);
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          llmTrace.finalizeFailure('llm:upstream-5xx', msg);
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
          { deviceId, kind: 'crystal-trial', inputHash: _inputHash, payload: parsed },
          _contentHash,
          (snapshot.schema_version as number) ?? crystalTrialSchemaVersion,
          runId,
        );

        if (genResult.usage) {
          await recordTokensRobust(deviceId, repos, llmTrace.trace, genResult.usage);
        }

        return { artifactId, contentHash: _contentHash };
      })) as PersistResult;

      // ---- 4. APPLY + READY — typed artifact.ready event ----
      await step.do('apply:crystal-trial', WORKFLOW_STORAGE_STEP_RETRY, async () => {
        await applyArtifactToLearningContent({
          learningContent: repos.learningContent,
          deviceId,
          runId,
          artifactKind: 'crystal-trial',
          payload: parsed,
          snapshot,
          contentHash: persisted.contentHash,
        });
      });

      await step.do('ready:crystal-trial', WORKFLOW_TERMINAL_STEP_RETRY, async () => {
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowArtifactReadyEventKey('crystal-trial', _inputHash),
          buildArtifactReadyEvent({
            artifactId: persisted.artifactId,
            kind: 'crystal-trial',
            contentHash: persisted.contentHash,
            inputHash: _inputHash,
            schemaVersion: (snapshot.schema_version as number) ?? crystalTrialSchemaVersion,
          }),
        );
        await repos.runs.markReady(runId);
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('completed'), buildRunCompletedEvent());
      });

    } catch (err) {
      if (err instanceof WorkflowAbort) return;
      if (err instanceof WorkflowFail) {
        await step.do('fail', WORKFLOW_TERMINAL_STEP_RETRY, async () => {
          await repos.runs.markFailed(runId, err.code, err.message);
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('failed'),
            buildRunFailedEvent(err.code, err.message),
          );
        });
        throw toWorkflowRuntimeError(err);
      }
      const message = err instanceof Error ? err.message : String(err);
      await step.do('fail', WORKFLOW_TERMINAL_STEP_RETRY, async () => {
        await repos.runs.markFailed(runId, 'llm:upstream-5xx', message);
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('failed'),
          buildRunFailedEvent('llm:upstream-5xx', message),
        );
      });
      throw err;
    }
  }
}
