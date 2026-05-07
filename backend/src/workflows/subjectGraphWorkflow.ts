/**
 * Subject Graph Workflow — Phase 2 PR-2C / Phase 3.6.
 *
 * Two-stage durable pipeline: Stage A (Topic Lattice) → Stage B (Prerequisite
 * Edges). Stage B's input_hash includes the Stage A artifact's content_hash.
 *
 * Phase 3.6: Budget reserved at route level (single owner). Typed event
 * builders and transport statuses throughout.
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { makeRepos } from '../repositories';
import { WorkflowFail, WorkflowAbort } from '../lib/workflowErrors';
import { callSubjectGraph } from '../llm/openrouterClient';
import { traceLlmCall, recordTokensRobust } from './shared/workflowObservability';
import {
  inputHash,
  contentHash,
  strictParseArtifact,
  semanticValidateArtifact,
  jsonSchemaResponseFormat,
  subjectGraphTopicsSchemaVersion,
  subjectGraphEdgesSchemaVersion,
} from '../contracts/generationContracts';
import {
  buildRunStatusEvent,
  buildStageProgressEvent,
  buildArtifactReadyEvent,
  buildRunCompletedEvent,
  buildRunFailedEvent,
  buildRunCancelledEvent,
} from '../contracts/typedEvents';
import type { Env } from '../env';
import type { ArtifactKind } from '../contracts/generationContracts';

// ---------------------------------------------------------------------------
// Step return shapes
// ---------------------------------------------------------------------------
interface PlanOutcomeOk {
  ok: true;
  snapshot: Record<string, unknown>;
  inputHash: string;
  checkpoints: Array<{ stage: string; artifact_id: string | null }>;
}
interface PlanOutcomeCached { ok: false }
type PlanOutcome = PlanOutcomeOk | PlanOutcomeCached;

interface GenerateResult {
  text: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
}

// ---------------------------------------------------------------------------
// Stage runner helper
// ---------------------------------------------------------------------------
interface StageRunResult {
  artifactId: string;
  contentHash: string;
  kind: ArtifactKind;
}

async function runStage(
  step: WorkflowStep,
  repos: ReturnType<typeof makeRepos>,
  runId: string,
  deviceId: string,
  stage: string,
  kind: ArtifactKind,
  snapshot: Record<string, unknown>,
  _inputHash: string,
  schemaVersion: number,
  exec: () => Promise<GenerateResult & { parsedPayload: Record<string, unknown> }>,
): Promise<StageRunResult> {
  await repos.runs.appendTyped(runId, deviceId,
    buildRunStatusEvent('generating_stage', stage),
  );
  await repos.stageCheckpoints.upsert({
    runId,
    stage,
    status: 'generating',
    inputHash: _inputHash,
    attempt: 0,
    startedAt: new Date().toISOString(),
  });

  const llmTrace = traceLlmCall({
    runId,
    deviceId,
    pipelineKind: 'subject-graph',
    stage,
    model: String((snapshot.model_id as string) ?? 'openrouter/google/gemini-2.5-flash'),
    promptVersion: (snapshot.prompt_template_version as number) ?? 0,
    schemaVersion,
    inputHash: _inputHash,
    providerHealingRequested: true,
  });

  let result: GenerateResult & { parsedPayload: Record<string, unknown> };
  try {
    result = (await step.do(
      `generate:${stage.replace(/:/g, '_')}`,
      { retries: { limit: 2, delay: 5, backoff: 'exponential' } },
      // @ts-expect-error exec return type contains `unknown` (safe — DB stores jsonb)
      exec,
    )) as GenerateResult & { parsedPayload: Record<string, unknown> };
    llmTrace.finalizeSuccess(result.usage);
  } catch (err) {
    if (err instanceof WorkflowFail) {
      llmTrace.finalizeFailure(err.code, err.message);
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      llmTrace.finalizeFailure('llm:upstream-5xx', msg);
    }
    throw err;
  }

  const _contentHash = await contentHash(result.parsedPayload);
  const artifactId = await repos.artifacts.putStorage(
    { deviceId, kind, inputHash: _inputHash, payload: result.parsedPayload },
    _contentHash,
    schemaVersion,
    runId,
  );

  await repos.stageCheckpoints.markReady(runId, stage, artifactId);

  if (result.usage) {
    await recordTokensRobust(deviceId, repos, llmTrace.trace, result.usage);
  }

  await repos.runs.appendTyped(runId, deviceId,
    buildArtifactReadyEvent({
      artifactId,
      kind,
      contentHash: _contentHash,
      inputHash: _inputHash,
      schemaVersion,
    }),
  );

  return { artifactId, contentHash: _contentHash, kind };
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------
export class SubjectGraphWorkflow extends WorkflowEntrypoint<
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

        const cached = await repos.artifacts.findCacheHit(deviceId, 'subject-graph-topics', _inputHash);
        if (cached) {
          await repos.runs.appendTyped(runId, deviceId,
            buildArtifactReadyEvent({
              artifactId: cached.id,
              kind: 'subject-graph-topics',
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

        const checkpoints = await repos.stageCheckpoints.byRun(runId);
        return {
          ok: true,
          snapshot,
          inputHash: _inputHash,
          checkpoints: checkpoints.map((c) => ({ stage: c.stage, artifact_id: c.artifact_id })),
        };
      })) as PlanOutcome;

      if (!planOutcome.ok) return;
      const { snapshot, inputHash: _inputHash, checkpoints } = planOutcome;

      const topicsSchemaVersion = (snapshot.schema_version as number) ?? subjectGraphTopicsSchemaVersion;
      const edgesSchemaVersion = (snapshot.schema_version as number) ?? subjectGraphEdgesSchemaVersion;

      // ---- 2. STAGE A: TOPIC LATTICE ----
      const topicsCkp = checkpoints.find((c) => c.stage === 'topics');
      if (topicsCkp?.artifact_id) {
        await repos.runs.appendTyped(runId, deviceId,
          buildStageProgressEvent('topics', undefined, 'resumed from checkpoint'),
        );
      } else {
        await checkCancel('before-topics');

        const topicsResponseFormat = jsonSchemaResponseFormat('subject-graph-topics');

        await runStage(
          step, repos, runId, deviceId, 'topics', 'subject-graph-topics',
          snapshot, _inputHash, topicsSchemaVersion,
          async () => {
            const messages = [
              {
                role: 'system',
                content: 'You are an Abyss Engine subject graph generator. Create a learning lattice for the given subject. Return valid JSON matching the schema.',
              },
              {
                role: 'user',
                content: `Generate the topic lattice for: "${String(snapshot.subject_id ?? 'subject')}". ` +
                  `Total tiers: ${String(((snapshot.strategy as Record<string, unknown>)?.total_tiers as number) ?? 3)}, ` +
                  `topics per tier: ${String(((snapshot.strategy as Record<string, unknown>)?.topics_per_tier as number) ?? 5)}.`,
              },
            ];

            const raw = await callSubjectGraph(
              {
                modelId: String(snapshot.model_id ?? 'openrouter/google/gemini-2.5-flash'),
                messages,
                responseFormat: topicsResponseFormat,
                providerHealingRequested: true,
              },
              this.env,
            );

            const parseResult = strictParseArtifact('subject-graph-topics', raw.text);
            if (!parseResult.ok) {
              throw new WorkflowFail(parseResult.failureCode, parseResult.message);
            }

            const semResult = semanticValidateArtifact('subject-graph-topics', parseResult.payload);
            if (!semResult.ok) {
              throw new WorkflowFail(semResult.failureCode, semResult.message ?? 'semantic validation failed');
            }

            return { ...raw, parsedPayload: parseResult.payload as Record<string, unknown> };
          },
        );
      }

      // ---- 3. STAGE B: PREREQUISITE EDGES ----
      const edgesCkp = checkpoints.find((c) => c.stage === 'edges');
      if (edgesCkp?.artifact_id) {
        await repos.runs.appendTyped(runId, deviceId,
          buildStageProgressEvent('edges', undefined, 'resumed from checkpoint'),
        );
      } else {
        await checkCancel('before-edges');

        const edgesResponseFormat = jsonSchemaResponseFormat('subject-graph-edges');

        await runStage(
          step, repos, runId, deviceId, 'edges', 'subject-graph-edges',
          snapshot, _inputHash, edgesSchemaVersion,
          async () => {
            const messages = [
              {
                role: 'system',
                content: 'You are an Abyss Engine prerequisite edge generator. Create prerequisite relationships between topics in the given lattice. Return valid JSON matching the schema.',
              },
              {
                role: 'user',
                content: `Generate prerequisite edges for the subject: "${
                  String(snapshot.subject_id ?? 'subject')
                }". Tier constraint: prerequisites can only go from lower tiers to higher tiers. No self-loops. No duplicate (source, target) pairs.`,
              },
            ];

            const raw = await callSubjectGraph(
              {
                modelId: String(snapshot.model_id ?? 'openrouter/google/gemini-2.5-flash'),
                messages,
                responseFormat: edgesResponseFormat,
                providerHealingRequested: true,
                temperature: 0.1,
              },
              this.env,
            );

            const parseResult = strictParseArtifact('subject-graph-edges', raw.text);
            if (!parseResult.ok) {
              throw new WorkflowFail(parseResult.failureCode, parseResult.message);
            }

            const semResult = semanticValidateArtifact('subject-graph-edges', parseResult.payload);
            if (!semResult.ok) {
              throw new WorkflowFail(semResult.failureCode, semResult.message ?? 'semantic validation failed');
            }

            return { ...raw, parsedPayload: parseResult.payload as Record<string, unknown> };
          },
        );
      }

      // ---- 4. READY ----
      await repos.runs.markReady(runId);
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
