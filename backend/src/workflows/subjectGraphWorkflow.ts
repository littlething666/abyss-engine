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
import { WorkflowFail, WorkflowAbort, toWorkflowRuntimeError } from '../lib/workflowErrors';
import { callSubjectGraph } from '../llm/openrouterClient';
import { traceLlmCall, recordTokensRobust } from './shared/workflowObservability';
import {
  WORKFLOW_LLM_STEP_RETRY,
  WORKFLOW_STORAGE_STEP_RETRY,
  WORKFLOW_TERMINAL_STEP_RETRY,
  appendWorkflowEventOnce,
  workflowArtifactReadyEventKey,
  workflowStageProgressEventKey,
  workflowStatusEventKey,
  workflowTerminalEventKey,
} from './shared/workflowDurability';
import {
  resolveGenerationJobPolicy,
  type BackendGenerationJobKind,
  type ResolvedGenerationJobPolicy,
} from '../generationPolicy';
import { applyArtifactToLearningContent } from '../learningContent/artifactApplication';
import {
  buildSubjectGraphEdgesMessages,
  buildSubjectGraphTopicsMessages,
  type SubjectGraphTopicPromptTopic,
} from '../prompts/generationPrompts';
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
interface CachedArtifactResult {
  artifactId: string;
  contentHash: string;
  inputHash: string;
  schemaVersion: number;
  storageKey: string;
}
interface PlanOutcomeOk {
  ok: true;
  snapshot: Record<string, unknown>;
  inputHash: string;
  checkpoints: Array<{ stage: string; artifact_id: string | null }>;
}
interface PlanOutcomeCached { ok: false; snapshot: Record<string, unknown>; cached: CachedArtifactResult }
type PlanOutcome = PlanOutcomeOk | PlanOutcomeCached;

function requireArtifactPayload(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

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
  exec: (generationPolicy: ResolvedGenerationJobPolicy) => Promise<GenerateResult & { parsedPayload: Record<string, unknown> }>,
): Promise<StageRunResult> {
  await step.do(`start:${stage.replace(/:/g, '_')}`, WORKFLOW_STORAGE_STEP_RETRY, async () => {
    await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStatusEventKey('generating_stage', stage),
      buildRunStatusEvent('generating_stage'),
    );
    await repos.stageCheckpoints.upsert({
      runId,
      stage,
      status: 'generating',
      inputHash: _inputHash,
      attempt: 0,
      startedAt: new Date().toISOString(),
    });
  });

  const generationPolicy = await resolveGenerationJobPolicy(deviceId, kind as BackendGenerationJobKind);

  const llmTrace = traceLlmCall({
    runId,
    deviceId,
    pipelineKind: 'subject-graph',
    stage,
    model: generationPolicy.modelId,
    generationPolicyHash: generationPolicy.generationPolicyHash,
    promptVersion: (snapshot.prompt_template_version as number) ?? 0,
    schemaVersion,
    inputHash: _inputHash,
    providerHealingRequested: generationPolicy.providerHealingRequested,
  });

  let result: GenerateResult & { parsedPayload: Record<string, unknown> };
  try {
    result = (await step.do(
      `generate:${stage.replace(/:/g, '_')}`,
      WORKFLOW_LLM_STEP_RETRY,
      // @ts-expect-error exec return type contains `unknown` (safe — DB stores jsonb)
      () => exec(generationPolicy),
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

  const persisted = (await step.do(`persist:${stage.replace(/:/g, '_')}`, WORKFLOW_STORAGE_STEP_RETRY, async (): Promise<StageRunResult> => {
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

    return { artifactId, contentHash: _contentHash, kind };
  })) as StageRunResult;

  await step.do(`apply:${stage.replace(/:/g, '_')}`, WORKFLOW_STORAGE_STEP_RETRY, async () => {
    await applyArtifactToLearningContent({
      learningContent: repos.learningContent,
      deviceId,
      runId,
      artifactKind: kind,
      payload: result.parsedPayload,
      snapshot,
      contentHash: persisted.contentHash,
    });
  });

  await step.do(`artifact-ready:${stage.replace(/:/g, '_')}`, WORKFLOW_STORAGE_STEP_RETRY, async () => {
    await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowArtifactReadyEventKey(kind, _inputHash),
      buildArtifactReadyEvent({
        artifactId: persisted.artifactId,
        kind,
        contentHash: persisted.contentHash,
        inputHash: _inputHash,
        schemaVersion,
      }),
    );
  });

  return persisted;
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

        const cached = await repos.artifacts.findCacheHit(deviceId, 'subject-graph-topics', _inputHash);
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

        const checkpoints = await repos.stageCheckpoints.byRun(runId);
        return {
          ok: true,
          snapshot,
          inputHash: _inputHash,
          checkpoints: checkpoints.map((c) => ({ stage: c.stage, artifact_id: c.artifact_id })),
        };
      })) as PlanOutcome;

      if (!planOutcome.ok) {
        const { snapshot, cached } = planOutcome;
        await step.do('apply:subject-graph-topics:cache', WORKFLOW_STORAGE_STEP_RETRY, async () => {
          const payload = requireArtifactPayload(
            await repos.artifacts.getStorage(cached.storageKey),
            `cached subject-graph-topics artifact ${cached.artifactId}`,
          );
          await applyArtifactToLearningContent({
            learningContent: repos.learningContent,
            deviceId,
            runId,
            artifactKind: 'subject-graph-topics',
            payload,
            snapshot,
            contentHash: cached.contentHash,
          });
        });
        await step.do('ready:subject-graph-topics:cache', WORKFLOW_TERMINAL_STEP_RETRY, async () => {
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowArtifactReadyEventKey('subject-graph-topics', cached.inputHash),
            buildArtifactReadyEvent({
              artifactId: cached.artifactId,
              kind: 'subject-graph-topics',
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
      const { snapshot, inputHash: _inputHash, checkpoints } = planOutcome;

      const topicsSchemaVersion = (snapshot.schema_version as number) ?? subjectGraphTopicsSchemaVersion;
      const edgesSchemaVersion = (snapshot.schema_version as number) ?? subjectGraphEdgesSchemaVersion;

      // ---- 2. STAGE A: TOPIC LATTICE ----
      // Phase 3.6 P0 #1: honour `retry_stage` set by the retry planner so
      // a Stage-B-only retry skips Stage A. Phase 3.6 P1 #1: capture
      // lattice topic IDs for Stage B semantic validation and fail loudly
      // when required context cannot be loaded.
      let latticeTopicIds: string[] | undefined;
      let latticeTopics: SubjectGraphTopicPromptTopic[] | undefined;
      let latticeArtifactContentHash = typeof snapshot.lattice_artifact_content_hash === 'string'
        ? snapshot.lattice_artifact_content_hash
        : undefined;

      const retryStage = snapshot.retry_stage as string | undefined;
      const skipStageA = retryStage === 'edges';

      const topicsCkp = checkpoints.find((c) => c.stage === 'topics');
      if (topicsCkp?.artifact_id || skipStageA) {
        const topicsProgressNote = skipStageA ? 'skipped (retry_stage=edges)' : 'resumed from checkpoint';
        await step.do('progress:topics:checkpoint', WORKFLOW_STORAGE_STEP_RETRY, async () => {
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStageProgressEventKey('topics', topicsProgressNote),
            buildStageProgressEvent('topics', undefined, topicsProgressNote),
          );
        });

        // When resuming from checkpoint or skipping Stage A, we MUST load
        // the Stage A artifact to extract lattice topic IDs for Stage B
        // semantic validation.  If the load fails, Stage B cannot validate
        // prerequisite edges — fail the workflow with a structured error
        // code (Phase 3.6 P1 #1).
        const artifactId = topicsCkp?.artifact_id ?? undefined;

        if (!artifactId && skipStageA) {
          // Retry wants edges-only but the parent has no Stage A checkpoint.
          throw new WorkflowFail(
            'precondition:missing-topic',
            'subject-graph edges retry: parent run has no Stage A (topics) checkpoint. Run Stage A first.',
          );
        }

        if (artifactId) {
          try {
            const stageARow = await repos.artifacts.get(artifactId);
            if (!stageARow) {
              throw new Error(`artifact row not found for ${artifactId}`);
            }
            latticeArtifactContentHash = stageARow.content_hash;
            const stageAPayload = await repos.artifacts.getStorage(stageARow.storage_key);
            if (
              stageAPayload &&
              typeof stageAPayload === 'object' &&
              Array.isArray((stageAPayload as Record<string, unknown>).topics)
            ) {
              latticeTopics = (stageAPayload as Record<string, unknown>).topics as SubjectGraphTopicPromptTopic[];
              latticeTopicIds = latticeTopics.map((t) => t.topicId);
            }
          } catch (err) {
            // Phase 3.6 P1 #1: Fail loudly — Stage B requires the Stage A
            // lattice for semantic validation.  A missing or unreadable
            // Stage A artifact is a precondition failure, not a warning.
            const msg = err instanceof Error ? err.message : String(err);
            throw new WorkflowFail(
              'precondition:missing-topic',
              `subject-graph Stage B: cannot load Stage A (topics) artifact (id=${artifactId}): ${msg}`,
            );
          }
        }
      } else {
        await checkCancel('before-topics');

        const topicsResponseFormat = jsonSchemaResponseFormat('subject-graph-topics');

        const topicsResult = await runStage(
          step, repos, runId, deviceId, 'topics', 'subject-graph-topics',
          snapshot, _inputHash, topicsSchemaVersion,
          async (generationPolicy) => {
            const raw = await callSubjectGraph(
              {
                modelId: generationPolicy.modelId,
                messages: buildSubjectGraphTopicsMessages(snapshot),
                responseFormat: topicsResponseFormat,
                providerHealingRequested: generationPolicy.providerHealingRequested,
                temperature: generationPolicy.temperature,
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

            // Capture lattice topic IDs for Stage B semantic validation.
            const topicsPayload = parseResult.payload as { topics?: SubjectGraphTopicPromptTopic[] };
            if (topicsPayload.topics && Array.isArray(topicsPayload.topics)) {
              latticeTopics = topicsPayload.topics;
              latticeTopicIds = topicsPayload.topics.map((t) => t.topicId);
            }

            return { ...raw, parsedPayload: parseResult.payload as Record<string, unknown> };
          },
        );
        latticeArtifactContentHash = topicsResult.contentHash;
      }

      // ---- 3. STAGE B: PREREQUISITE EDGES ----
      // Phase 3.6 P0 #1: honour `retry_stage` — when explicitly set to
      // 'topics', the caller only wants Stage A; skip Stage B entirely.
      const skipStageB = retryStage === 'topics';
      if (skipStageB) {
        await step.do('progress:edges:skipped', WORKFLOW_STORAGE_STEP_RETRY, async () => {
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStageProgressEventKey('edges', 'skipped (retry_stage=topics)'),
            buildStageProgressEvent('edges', undefined, 'skipped (retry_stage=topics)'),
          );
        });
      }

      const edgesCkp = checkpoints.find((c) => c.stage === 'edges');
      if (edgesCkp?.artifact_id) {
        await step.do('progress:edges:checkpoint', WORKFLOW_STORAGE_STEP_RETRY, async () => {
          await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStageProgressEventKey('edges', 'resumed from checkpoint'),
            buildStageProgressEvent('edges', undefined, 'resumed from checkpoint'),
          );
        });
      } else if (!skipStageB) {
        await checkCancel('before-edges');

        const edgesResponseFormat = jsonSchemaResponseFormat('subject-graph-edges');

        await runStage(
          step, repos, runId, deviceId, 'edges', 'subject-graph-edges',
          snapshot, _inputHash, edgesSchemaVersion,
          async (generationPolicy) => {
            const raw = await callSubjectGraph(
              {
                modelId: generationPolicy.modelId,
                messages: buildSubjectGraphEdgesMessages({
                  ...snapshot,
                  lattice_artifact_content_hash: latticeArtifactContentHash,
                }, latticeTopics ?? []),
                responseFormat: edgesResponseFormat,
                providerHealingRequested: generationPolicy.providerHealingRequested,
                temperature: generationPolicy.temperature,
              },
              this.env,
            );

            const parseResult = strictParseArtifact('subject-graph-edges', raw.text);
            if (!parseResult.ok) {
              throw new WorkflowFail(parseResult.failureCode, parseResult.message);
            }

            const semResult = semanticValidateArtifact('subject-graph-edges', parseResult.payload, {
              latticeTopicIds: latticeTopicIds ?? [],
            });
            if (!semResult.ok) {
              throw new WorkflowFail(semResult.failureCode, semResult.message ?? 'semantic validation failed');
            }

            return { ...raw, parsedPayload: parseResult.payload as Record<string, unknown> };
          },
        );
      }

      // ---- 4. READY ----
      await step.do('ready', WORKFLOW_TERMINAL_STEP_RETRY, async () => {
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
