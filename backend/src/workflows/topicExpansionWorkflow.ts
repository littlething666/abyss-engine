/**
 * Topic Expansion Workflow — Phase 2 PR-2B / Phase 3.6.
 *
 * Single-stage durable pipeline: generate → parse → validate → persist.
 * Mirrors `runExpansionJob.ts` but runs server-side on Cloudflare Workflows
 * with strict json_schema from the contracts module and cooperative cancel.
 *
 * Phase 3.6: Budget reserved at route level (single owner). Typed event
 * builders and transport statuses throughout.
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { makeRepos } from '../repositories';
import { WorkflowFail, WorkflowAbort } from '../lib/workflowErrors';
import { callTopicExpansion } from '../llm/openrouterClient';
import { traceLlmCall, recordTokensRobust } from './shared/workflowObservability';
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

// ---------------------------------------------------------------------------
// Step return shapes
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

    const checkCancel = async (boundary: string) => {
      const reason = await repos.runs.cancelRequested(runId);
      if (reason) {
        await repos.runs.markCancelled(runId);
        await repos.runs.appendTyped(runId, deviceId,
          buildRunCancelledEvent(boundary, reason),
        );
        throw new WorkflowAbort('cancelled');
      }
    };

    try {
      // ---- 1. PLAN (no budget check — Phase 3.6 Step 4) ----
      await checkCancel('before-plan');

      const planOutcome = (await step.do('plan', async (): Promise<PlanOutcome> => {
        await repos.runs.transition(runId, 'planning');
        await repos.runs.appendTyped(runId, deviceId,
          buildRunStatusEvent('planning'),
        );

        const run = await repos.runs.load(runId);
        const snapshot = run.snapshot_json as Record<string, unknown>;
        const _inputHash = await inputHash(snapshot);

        const cached = await repos.artifacts.findCacheHit(deviceId, 'topic-expansion-cards', _inputHash);
        if (cached) {
          await repos.runs.appendTyped(runId, deviceId,
            buildArtifactReadyEvent({
              artifactId: cached.id,
              kind: 'topic-expansion-cards',
              contentHash: cached.content_hash,
              inputHash: _inputHash,
              schemaVersion: cached.schema_version,
              fromCache: true,
            }),
          );
          await repos.runs.markReady(runId);
          await repos.runs.appendTyped(runId, deviceId, buildRunCompletedEvent());
          return { ok: false };
        }

        return { ok: true, snapshot, inputHash: _inputHash };
      })) as PlanOutcome;

      if (!planOutcome.ok) return;
      const { snapshot, inputHash: _inputHash } = planOutcome;

      // ---- 2. GENERATE ----
      await checkCancel('before-generate');

      const llmTrace = traceLlmCall({
        runId,
        deviceId,
        pipelineKind: 'topic-expansion',
        stage: 'generate',
        model: String(snapshot.model_id ?? 'openrouter/google/gemini-2.5-flash'),
        promptVersion: (snapshot.prompt_template_version as number) ?? 0,
        schemaVersion: (snapshot.schema_version as number) ?? topicExpansionCardsSchemaVersion,
        inputHash: _inputHash,
        providerHealingRequested: true,
      });

      const responseFormat = jsonSchemaResponseFormat('topic-expansion-cards');

      let genResult: GenerateResult;
      try {
        genResult = (await step.do(
          'generate',
          { retries: { limit: 2, delay: 5, backoff: 'exponential' } },
          async (): Promise<GenerateResult> => {
            await repos.runs.transition(runId, 'generating_stage');
            await repos.runs.appendTyped(runId, deviceId,
              buildRunStatusEvent('generating_stage'),
            );

            const messages = [
              {
                role: 'system',
                content: 'You are an Abyss Engine topic-expansion card generator. Generate new study cards at the requested difficulty level that complement the existing card pool. Return valid JSON matching the schema.',
              },
              {
                role: 'user',
                content: `Generate topic expansion cards for "${
                  String(snapshot.topic_title ?? snapshot.topic_id ?? 'topic')
                }" at difficulty level ${String(snapshot.next_level ?? snapshot.difficulty ?? 2)}. Use the provided theory and avoid duplicating existing concept stems.`,
              },
            ];

            return callTopicExpansion(
              {
                modelId: String(snapshot.model_id ?? 'openrouter/google/gemini-2.5-flash'),
                messages,
                responseFormat,
                providerHealingRequested: true,
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

      // ---- 3. PARSE — strict contracts parser ----
      await checkCancel('before-parse');

      // @ts-expect-error Serializable<Record> rejects `unknown` values.
      const parsed = (await step.do('parse', async () => {
        await repos.runs.transition(runId, 'parsing');
        await repos.runs.appendTyped(runId, deviceId,
          buildRunStatusEvent('parsing'),
        );
        const result = strictParseArtifact('topic-expansion-cards', genResult.text);
        if (!result.ok) {
          throw new WorkflowFail(result.failureCode, result.message);
        }
        return result.payload;
      })) as Record<string, unknown>;

      // ---- 4. VALIDATE — semantic validator ----
      await checkCancel('before-validate');

      await step.do('validate', async () => {
        await repos.runs.transition(runId, 'validating');
        await repos.runs.appendTyped(runId, deviceId,
          buildRunStatusEvent('validating'),
        );
        const existingStems = Array.isArray(snapshot.existing_concept_stems)
          ? (snapshot.existing_concept_stems as string[])
          : undefined;
        const ctx = existingStems ? { existingConceptStems: existingStems } : undefined;
        const result = semanticValidateArtifact('topic-expansion-cards', parsed, ctx);
        if (!result.ok) {
          throw new WorkflowFail(result.failureCode, result.message ?? 'semantic validation failed');
        }
      });

      // ---- 5. PERSIST ----
      await checkCancel('before-persist');

      const persisted = (await step.do('persist', async (): Promise<PersistResult> => {
        await repos.runs.transition(runId, 'persisting');
        await repos.runs.appendTyped(runId, deviceId,
          buildRunStatusEvent('persisting'),
        );
        const _contentHash = await contentHash(parsed);

        const artifactId = await repos.artifacts.putStorage(
          { deviceId, kind: 'topic-expansion-cards', inputHash: _inputHash, payload: parsed },
          _contentHash,
          (snapshot.schema_version as number) ?? topicExpansionCardsSchemaVersion,
          runId,
        );

        if (genResult.usage) {
          await recordTokensRobust(deviceId, repos, llmTrace.trace, genResult.usage);
        }

        return { artifactId, contentHash: _contentHash };
      })) as PersistResult;

      // ---- 6. READY ----
      await repos.runs.markReady(runId);
      await repos.runs.appendTyped(runId, deviceId,
        buildArtifactReadyEvent({
          artifactId: persisted.artifactId,
          kind: 'topic-expansion-cards',
          contentHash: persisted.contentHash,
          inputHash: _inputHash,
          schemaVersion: (snapshot.schema_version as number) ?? topicExpansionCardsSchemaVersion,
        }),
      );
      await repos.runs.appendTyped(runId, deviceId, buildRunCompletedEvent());
    } catch (err) {
      if (err instanceof WorkflowAbort) return;
      if (err instanceof WorkflowFail) {
        await repos.runs.markFailed(runId, err.code, err.message);
        await repos.runs.appendTyped(runId, deviceId,
          buildRunFailedEvent(err.code, err.message),
        );
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      await repos.runs.markFailed(runId, 'llm:upstream-5xx', message);
      await repos.runs.appendTyped(runId, deviceId,
        buildRunFailedEvent('llm:upstream-5xx', message),
      );
      throw err;
    }
  }
}
