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
  appendWorkflowEventOnce,
  workflowArtifactReadyEventKey,
  workflowStatusEventKey,
  workflowTerminalEventKey,
} from './shared/workflowDurability';
import { resolveGenerationJobPolicy } from '../generationPolicy';
import { buildCrystalTrialMessages } from '../prompts/generationPrompts';
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
interface PlanOutcomeOk { ok: true; snapshot: Record<string, unknown>; inputHash: string }
interface PlanOutcomeCached { ok: false }
type PlanOutcome = PlanOutcomeOk | PlanOutcomeCached;

interface GenerateResult {
  text: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
}

interface PersistResult { artifactId: string; contentHash: string }

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
        await repos.runs.markCancelled(runId);
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('cancelled'),
          buildRunCancelledEvent(boundary, reason),
        );
        throw new WorkflowAbort('cancelled');
      }
    };

    try {
      // ---- 1. PLAN (no budget check — reserved at route level, Phase 3.6 Step 4) ----
      await checkCancel('before-plan');

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
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowArtifactReadyEventKey('crystal-trial', _inputHash),
            buildArtifactReadyEvent({
              artifactId: cached.id,
              kind: 'crystal-trial',
              contentHash: cached.content_hash,
              inputHash: _inputHash,
              schemaVersion: cached.schema_version,
              fromCache: true,
            }),
          );
          await repos.runs.markReady(runId);
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('completed'), buildRunCompletedEvent());
          return { ok: false };
        }

        return { ok: true, snapshot, inputHash: _inputHash };
      })) as PlanOutcome;

      if (!planOutcome.ok) return;
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

      let genResult: GenerateResult;
      try {
        genResult = (await step.do(
          'generate',
          WORKFLOW_LLM_STEP_RETRY,
          async (): Promise<GenerateResult> => {
            await repos.runs.transition(runId, 'generating_stage');
            await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStatusEventKey('generating_stage', 'generate'),
              buildRunStatusEvent('generating_stage'),
            );

            return callCrystalTrial(
              {
                modelId: generationPolicy.modelId,
                messages: buildCrystalTrialMessages(snapshot),
                responseFormat,
                providerHealingRequested: generationPolicy.providerHealingRequested,
              },
              this.env,
            );
          },
        )) as GenerateResult;
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

      // ---- 3. PARSE — strict contracts parser, no retries ----
      await checkCancel('before-parse');

      // @ts-expect-error Serializable<Record> rejects `unknown` values; JSON.parse output is persisted as jsonb.
      const parsed = (await step.do('parse', async () => {
        await repos.runs.transition(runId, 'parsing');
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStatusEventKey('parsing', 'parse'),
          buildRunStatusEvent('parsing'),
        );
        const result = strictParseArtifact('crystal-trial', genResult.text);
        if (!result.ok) {
          throw new WorkflowFail(result.failureCode, result.message);
        }
        return result.payload;
      })) as Record<string, unknown>;

      // ---- 4. VALIDATE — semantic validator, no retries ----
      await checkCancel('before-validate');

      await step.do('validate', async () => {
        await repos.runs.transition(runId, 'validating');
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStatusEventKey('validating', 'validate'),
          buildRunStatusEvent('validating'),
        );
        const expectedQuestionCount = snapshot.question_count as number | undefined;
        const ctx = expectedQuestionCount !== undefined
          ? { expectedQuestionCount }
          : undefined;
        const result = semanticValidateArtifact('crystal-trial', parsed, ctx);
        if (!result.ok) {
          throw new WorkflowFail(result.failureCode, result.message ?? 'semantic validation failed');
        }
      });

      // ---- 5. PERSIST ----
      await checkCancel('before-persist');

      const persisted = (await step.do('persist', async (): Promise<PersistResult> => {
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

      // ---- 6. READY — typed artifact.ready event ----
      await repos.runs.markReady(runId);
      await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowArtifactReadyEventKey('crystal-trial', _inputHash),
        buildArtifactReadyEvent({
          artifactId: persisted.artifactId,
          kind: 'crystal-trial',
          contentHash: persisted.contentHash,
          inputHash: _inputHash,
          schemaVersion: (snapshot.schema_version as number) ?? crystalTrialSchemaVersion,
        }),
      );
      await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('completed'), buildRunCompletedEvent());

    } catch (err) {
      if (err instanceof WorkflowAbort) return;
      if (err instanceof WorkflowFail) {
        await repos.runs.markFailed(runId, err.code, err.message);
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('failed'),
          buildRunFailedEvent(err.code, err.message),
        );
        throw toWorkflowRuntimeError(err);
      }
      const message = err instanceof Error ? err.message : String(err);
      await repos.runs.markFailed(runId, 'llm:upstream-5xx', message);
      await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('failed'),
        buildRunFailedEvent('llm:upstream-5xx', message),
      );
      throw err;
    }
  }
}
