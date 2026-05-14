/**
 * Topic Content Workflow — Phase 2 PR-2D / Phase 3.6.
 *
 * Durable topic-content pipeline:
 * theory → planning checkpoints → study-cards → plan-gated mini-games.
 *
 * Phase 3.6: Typed event
 * builders and transport statuses throughout.
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { makeRepos } from '../repositories';
import { WorkflowFail, WorkflowAbort, toWorkflowStepError, workflowFailureDetails } from '../lib/workflowErrors';
import { callTopicContent } from '../llm/llmClient';
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
import {
  resolveGenerationJobPolicy,
  type BackendGenerationJobKind,
  type ResolvedGenerationJobPolicy,
} from '../generationPolicy';
import {
  buildTopicCardContentMessages,
  buildTopicCardPlanMessages,
  buildTopicConceptPlanMessages,
  buildTopicMiniGameMessages,
  buildTopicStudyCardsMessages,
  buildTopicTheoryMessages,
} from '../prompts/generationPrompts';
import { topicContentStageInputHash } from './topicContentStageInputHash';
import { applyArtifactToLearningContent } from '../learningContent/artifactApplication';
import {
  buildTopicCardPlanSnapshot,
  buildTopicConceptPlanSnapshot,
  compileTopicCardPlan,
  compileTopicConceptPlan,
  loadCompiledTopicCardPlanCheckpoint,
  loadCompiledTopicConceptPlanCheckpoint,
  persistCompiledTopicCardPlanCheckpoint,
  persistCompiledTopicConceptPlanCheckpoint,
  topicPlanJsonSchemaResponseFormat,
  TOPIC_CARD_PLAN_ARTIFACT_KIND,
  TOPIC_CARD_PLAN_CHECKPOINT_STAGE,
  TOPIC_CARD_PLAN_SCHEMA_VERSION,
  TOPIC_CONCEPT_PLAN_ARTIFACT_KIND,
  TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE,
  TOPIC_CONCEPT_PLAN_SCHEMA_VERSION,
  topicCardPlanArtifactPayloadSchema,
  topicConceptPlanArtifactPayloadSchema,
  type CompiledTopicCardPlan,
  type CompiledTopicConceptSpec,
  type PersistedTopicPlanCheckpoint,
  type TopicCardPlanArtifactPayload,
  type TopicCardPlanCheckpointPayload,
  type TopicConceptPlanArtifactPayload,
  type TopicConceptPlanCheckpointPayload,
} from '../learningContent';
import {
  inputHash,
  contentHash,
  strictParseArtifact,
  semanticValidateArtifact,
  jsonSchemaResponseFormat,
  topicTheorySchemaVersion,
  topicStudyCardsSchemaVersion,
  topicCardContentSchemaVersion,
  topicMiniGameCategorySortSchemaVersion,
  topicMiniGameSequenceBuildSchemaVersion,
  topicMiniGameMatchPairsSchemaVersion,
} from '../contracts/generationContracts';
import {
  buildRunStatusEvent,
  buildArtifactReadyEvent,
  buildRunCompletedEvent,
  buildRunFailedEvent,
  buildRunCancelledEvent,
} from '../contracts/typedEvents';
import type { Env } from '../env';
import type { ArtifactKind } from '../contracts/generationContracts';
import { createLogger } from '../observability/logger';
import { writeRunDebugBundle } from '../observability/debugBundle';
import {
  buildTopicTheorySourceSpans,
  formatTheorySourceSpansForPrompt,
  selectRelevantTheorySourceSpans,
  topicTheorySourceSpansAsJson,
  type TopicTheorySourceSpan,
} from '../learningContent/theorySourceSpans';
import {
  isTopicCardPlanCheckpointReusable,
  isTopicConceptPlanCheckpointReusable,
} from './topicPlanningCheckpointReuse';
import {
  compiledMiniGameSpecsForType,
  miniGameSpecsForPrompt,
  resolvePlannedTopicMiniGameStages,
  sourceSpanIdsForMiniGameType,
  TOPIC_MINI_GAME_TYPES,
  type TopicMiniGameType,
  type TopicMiniGameStage,
} from './topicMiniGamePlanStages';
import {
  compiledStudyCardSpecsForPrompt,
  sourceSpanIdsForStudyCardSpecs,
} from './topicStudyCardPlanStages';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MINI_GAME_TYPES = TOPIC_MINI_GAME_TYPES;
type MiniGameType = TopicMiniGameType;

const MINI_GAME_ARTIFACT_KINDS: Record<MiniGameType, ArtifactKind> = {
  CATEGORY_SORT: 'topic-mini-game-category-sort',
  SEQUENCE_BUILD: 'topic-mini-game-sequence-build',
  MATCH_PAIRS: 'topic-mini-game-match-pairs',
};

const MINI_GAME_SCHEMA_VERSIONS: Record<MiniGameType, number> = {
  CATEGORY_SORT: topicMiniGameCategorySortSchemaVersion,
  SEQUENCE_BUILD: topicMiniGameSequenceBuildSchemaVersion,
  MATCH_PAIRS: topicMiniGameMatchPairsSchemaVersion,
};

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
}

interface StageRunResult {
  artifactId: string;
  contentHash: string;
  kind: ArtifactKind;
}

interface TopicPlanningState {
  sourceSpans: TopicTheorySourceSpan[];
  concepts: CompiledTopicConceptSpec[];
  cardPlan: CompiledTopicCardPlan;
  conceptCheckpoint: {
    artifactId: string;
    inputHash: string;
    contentHash: string;
    payload: TopicConceptPlanCheckpointPayload;
  };
  cardCheckpoint: {
    artifactId: string;
    inputHash: string;
    contentHash: string;
    payload: TopicCardPlanCheckpointPayload;
  };
}

interface PlanningGenerationResult<TPayload> {
  payload: TPayload;
  promptInputHash: string;
  jobId: string | null;
}

// ---------------------------------------------------------------------------
// Stage runner helper
// ---------------------------------------------------------------------------
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
  generate: (generationPolicy: ResolvedGenerationJobPolicy) => Promise<GenerateResult>,
  parseAndValidate: (raw: GenerateResult) => Promise<Record<string, unknown>> | Record<string, unknown>,
): Promise<StageRunResult> {
  const safeStage = stage.replace(/:/g, '_');

  await step.do(`start:${safeStage}`, WORKFLOW_STORAGE_STEP_RETRY, async () => {
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
    pipelineKind: 'topic-content',
    stage,
    model: generationPolicy.modelId,
    generationPolicyHash: generationPolicy.generationPolicyHash,
    promptVersion: (snapshot.prompt_template_version as number) ?? 0,
    schemaVersion,
    inputHash: _inputHash,
    providerHealingRequested: generationPolicy.providerHealingRequested,
  });

  let raw: GenerateResult;
  try {
    raw = (await step.do(
      `generate:${safeStage}`,
      WORKFLOW_LLM_STEP_RETRY,
      async () => {
        try {
          return await generate(generationPolicy);
        } catch (err) {
          throw toWorkflowStepError(err);
        }
      },
    )) as GenerateResult;
    const trace = llmTrace.finalizeSuccess();
    const jobId = await recordLlmJob({ repos, runId, pipelineKind: 'topic-content', stage, inputHash: _inputHash, model: generationPolicy.modelId, status: 'success', trace });
    if (jobId) {
      await repos.stageCheckpoints.linkJob(runId, stage, jobId);
    }
  } catch (err) {
    const failure = workflowFailureDetails(err, 'llm:upstream-transient');
    const trace = llmTrace.finalizeFailure(failure.code, failure.message);
    const jobId = await recordLlmJob({ repos, runId, pipelineKind: 'topic-content', stage, inputHash: _inputHash, model: generationPolicy.modelId, status: 'failed', trace, errorCode: failure.code, errorMessage: failure.message });
    if (jobId) {
      await repos.stageCheckpoints.linkJob(runId, stage, jobId).catch(() => undefined);
    }
    await repos.stageCheckpoints.markFailed(runId, stage, failure.code, failure.message).catch((checkpointErr) => {
      createLogger({ runId, deviceId, pipelineKind: 'topic-content', stage }).warn('stage_checkpoint.mark_failed.failed', {
        errorMessage: checkpointErr instanceof Error ? checkpointErr.message : String(checkpointErr),
      });
    });
    throw err;
  }

  let parsedPayload: Record<string, unknown>;
  try {
    parsedPayload = await parseAndValidate(raw);
  } catch (err) {
    const failure = workflowFailureDetails(err, 'parse:zod-shape');
    await repos.stageCheckpoints.markFailed(runId, stage, failure.code, failure.message).catch((checkpointErr) => {
      createLogger({ runId, deviceId, pipelineKind: 'topic-content', stage }).warn('stage_checkpoint.mark_failed.failed', {
        errorMessage: checkpointErr instanceof Error ? checkpointErr.message : String(checkpointErr),
      });
    });
    throw err;
  }

  const result = { ...raw, parsedPayload };

  const persisted = (await step.do(`persist:${safeStage}`, WORKFLOW_STORAGE_STEP_RETRY, async (): Promise<StageRunResult> => {
    const _contentHash = await contentHash(result.parsedPayload);
    const artifactId = await repos.artifacts.putStorage(
      { deviceId, kind, inputHash: _inputHash, payload: result.parsedPayload },
      _contentHash,
      schemaVersion,
      runId,
    );

    await repos.stageCheckpoints.markReady(runId, stage, artifactId);

    return { artifactId, contentHash: _contentHash, kind };
  })) as StageRunResult;

  await step.do(`apply:${safeStage}`, WORKFLOW_STORAGE_STEP_RETRY, async () => {
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

  await step.do(`artifact-ready:${safeStage}`, WORKFLOW_STORAGE_STEP_RETRY, async () => {
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

async function loadStageArtifactContentHash(
  repos: ReturnType<typeof makeRepos>,
  artifactId: string,
  stage: string,
): Promise<string> {
  const artifact = await repos.artifacts.get(artifactId);
  if (!artifact) {
    throw new WorkflowFail('precondition:missing-topic', `topic-content ${stage} checkpoint artifact row not found: ${artifactId}`);
  }
  return artifact.content_hash;
}

async function useCachedStage(
  step: WorkflowStep,
  repos: ReturnType<typeof makeRepos>,
  runId: string,
  deviceId: string,
  stage: string,
  kind: ArtifactKind,
  stageInputHash: string,
  snapshot: Record<string, unknown>,
): Promise<StageRunResult | null> {
  const cached = await repos.artifacts.findCacheHit(deviceId, kind, stageInputHash);
  if (!cached) return null;

  await step.do(`apply-cache:${stage.replace(/:/g, '_')}`, WORKFLOW_STORAGE_STEP_RETRY, async () => {
    const payload = await repos.artifacts.getStorage(cached.storage_key);
    if (!isRecord(payload)) {
      throw new WorkflowFail('precondition:missing-topic', `cached ${kind} artifact ${cached.id} must be a JSON object`);
    }
    await applyArtifactToLearningContent({
      learningContent: repos.learningContent,
      deviceId,
      runId,
      artifactKind: kind,
      payload,
      snapshot,
      contentHash: cached.content_hash,
    });
  });

  await step.do(`cache-ready:${stage.replace(/:/g, '_')}`, WORKFLOW_STORAGE_STEP_RETRY, async () => {
    const now = new Date().toISOString();
    await repos.stageCheckpoints.upsert({
      runId,
      stage,
      status: 'ready',
      inputHash: stageInputHash,
      attempt: 0,
      artifactId: cached.id,
      startedAt: now,
      finishedAt: now,
    });
    await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowArtifactReadyEventKey(kind, stageInputHash),
      buildArtifactReadyEvent({
        artifactId: cached.id,
        kind,
        contentHash: cached.content_hash,
        inputHash: stageInputHash,
        schemaVersion: cached.schema_version,
        fromCache: true,
      }),
    );
  });

  return { artifactId: cached.id, contentHash: cached.content_hash, kind };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new WorkflowFail('precondition:missing-topic', `${label} must be a JSON object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be a non-empty string`);
  }
  return value;
}

async function setTopicContentStatus(
  repos: ReturnType<typeof makeRepos>,
  deviceId: string,
  runId: string,
  snapshot: Record<string, unknown>,
  status: 'generating' | 'unavailable' | 'ready',
): Promise<void> {
  const subjectId = requireString(snapshot.subject_id, 'snapshot.subject_id');
  const topicId = requireString(snapshot.topic_id, 'snapshot.topic_id');
  const existing = await repos.learningContent.getTopicDetails(deviceId, subjectId, topicId);
  if (!existing) return;
  await repos.learningContent.putTopicDetails({
    deviceId,
    subjectId,
    topicId,
    details: existing.details,
    contentHash: existing.contentHash,
    status,
    updatedByRunId: runId,
  });
}

async function setTopicGeneratingIfStudyPipeline(
  repos: ReturnType<typeof makeRepos>,
  deviceId: string,
  runId: string,
  snapshot: Record<string, unknown>,
): Promise<void> {
  const stage = (snapshot.resume_from_stage as string | undefined) ?? (snapshot.stage as string | undefined) ?? 'full';
  if (stage !== 'full' && stage !== 'study-cards' && stage !== 'mini-games') return;
  const subjectId = requireString(snapshot.subject_id, 'snapshot.subject_id');
  const topicId = requireString(snapshot.topic_id, 'snapshot.topic_id');
  const existing = await repos.learningContent.getTopicDetails(deviceId, subjectId, topicId);
  if (!existing || existing.status === 'ready') return;
  await repos.learningContent.putTopicDetails({
    deviceId,
    subjectId,
    topicId,
    details: existing.details,
    contentHash: existing.contentHash,
    status: 'generating',
    updatedByRunId: runId,
  });
}

async function clearStaleGeneratingTopicStatus(
  repos: ReturnType<typeof makeRepos>,
  deviceId: string,
  runId: string,
  snapshot: Record<string, unknown>,
): Promise<void> {
  const subjectId = requireString(snapshot.subject_id, 'snapshot.subject_id');
  const topicId = requireString(snapshot.topic_id, 'snapshot.topic_id');
  const existing = await repos.learningContent.getTopicDetails(deviceId, subjectId, topicId);
  if (!existing || existing.status !== 'generating') return;
  const theory = typeof existing.details.theory === 'string' ? existing.details.theory.trim() : '';
  const cards = await repos.learningContent.getTopicCards(deviceId, subjectId, topicId);
  const hasDifficultyOneCard = cards.some((card) => card.difficulty === 1);
  await setTopicContentStatus(repos, deviceId, runId, snapshot, theory && hasDifficultyOneCard ? 'ready' : 'unavailable');
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be an array of non-empty strings`);
  }
  return [...value] as string[];
}

function hasStagePromptContext(snapshot: Record<string, unknown>): boolean {
  return typeof snapshot.theory_excerpt === 'string' && Array.isArray(snapshot.syllabus_questions);
}

function parsePlanningJsonObject(raw: GenerateResult, kind: string): Record<string, unknown> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw.text) as unknown;
  } catch (err) {
    throw new WorkflowFail('parse:zod-shape', `${kind} response is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  return requireRecord(decoded, `${kind} response`);
}

function summarizePlanningIssues(error: { issues: Array<{ path: readonly unknown[]; message: string }> }): string {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `${path}: ${issue.message}`;
  }).join('; ');
}

function parseTopicConceptPlanPayload(raw: GenerateResult): TopicConceptPlanArtifactPayload {
  const parsed = topicConceptPlanArtifactPayloadSchema.safeParse(parsePlanningJsonObject(raw, TOPIC_CONCEPT_PLAN_ARTIFACT_KIND));
  if (!parsed.success) {
    throw new WorkflowFail(
      'validation:semantic-topic-content',
      `${TOPIC_CONCEPT_PLAN_ARTIFACT_KIND} payload is invalid: ${summarizePlanningIssues(parsed.error)}`,
    );
  }
  return parsed.data;
}

function parseTopicCardPlanPayload(raw: GenerateResult): TopicCardPlanArtifactPayload {
  const parsed = topicCardPlanArtifactPayloadSchema.safeParse(parsePlanningJsonObject(raw, TOPIC_CARD_PLAN_ARTIFACT_KIND));
  if (!parsed.success) {
    throw new WorkflowFail(
      'validation:semantic-topic-content',
      `${TOPIC_CARD_PLAN_ARTIFACT_KIND} payload is invalid: ${summarizePlanningIssues(parsed.error)}`,
    );
  }
  return parsed.data;
}

function stableStringList(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

async function loadTheorySourceSpansForPlanning(
  repos: ReturnType<typeof makeRepos>,
  snapshot: Record<string, unknown>,
  theoryArtifactId: string,
): Promise<TopicTheorySourceSpan[]> {
  const artifact = await repos.artifacts.get(theoryArtifactId);
  if (!artifact) {
    throw new WorkflowFail('precondition:missing-topic', `topic-content theory artifact row not found: ${theoryArtifactId}`);
  }
  const payload = requireRecord(await repos.artifacts.getStorage(artifact.storage_key), `topic-content theory artifact ${theoryArtifactId}`);
  return buildTopicTheorySourceSpans({
    subjectId: requireString(snapshot.subject_id, 'snapshot.subject_id'),
    topicId: requireString(snapshot.topic_id, 'snapshot.topic_id'),
    payload,
  });
}

async function runPlanningLlmStage<TPayload>(input: {
  step: WorkflowStep;
  repos: ReturnType<typeof makeRepos>;
  env: Env;
  runId: string;
  deviceId: string;
  stage: typeof TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE | typeof TOPIC_CARD_PLAN_CHECKPOINT_STAGE;
  jobKind: BackendGenerationJobKind;
  schemaVersion: number;
  snapshot: Record<string, unknown>;
  responseFormat: ReturnType<typeof topicPlanJsonSchemaResponseFormat>;
  messages: ReturnType<typeof buildTopicConceptPlanMessages>;
  parse: (raw: GenerateResult) => TPayload;
}): Promise<PlanningGenerationResult<TPayload>> {
  const safeStage = input.stage.replace(/:/g, '_');
  const promptInputHash = await inputHash(input.snapshot);

  await input.step.do(`start:${safeStage}`, WORKFLOW_STORAGE_STEP_RETRY, async () => {
    await appendWorkflowEventOnce(input.repos.runs, input.runId, input.deviceId, workflowStatusEventKey('generating_stage', input.stage),
      buildRunStatusEvent('generating_stage'),
    );
    await input.repos.stageCheckpoints.upsert({
      runId: input.runId,
      stage: input.stage,
      status: 'generating',
      inputHash: promptInputHash,
      attempt: 0,
      startedAt: new Date().toISOString(),
    });
  });

  const generationPolicy = await resolveGenerationJobPolicy(input.deviceId, input.jobKind);
  const llmTrace = traceLlmCall({
    runId: input.runId,
    deviceId: input.deviceId,
    pipelineKind: 'topic-content',
    stage: input.stage,
    model: generationPolicy.modelId,
    generationPolicyHash: generationPolicy.generationPolicyHash,
    promptVersion: 1,
    schemaVersion: input.schemaVersion,
    inputHash: promptInputHash,
    providerHealingRequested: generationPolicy.providerHealingRequested,
  });

  let raw: GenerateResult;
  let jobId: string | null = null;
  try {
    raw = (await input.step.do(
      `generate:${safeStage}`,
      WORKFLOW_LLM_STEP_RETRY,
      async () => {
        try {
          return await callTopicContent({
            modelId: generationPolicy.modelId,
            messages: input.messages,
            responseFormat: input.responseFormat,
            providerHealingRequested: generationPolicy.providerHealingRequested,
            temperature: generationPolicy.temperature,
            stage: input.stage,
          }, input.env);
        } catch (err) {
          throw toWorkflowStepError(err);
        }
      },
    )) as GenerateResult;
    const trace = llmTrace.finalizeSuccess();
    jobId = await recordLlmJob({
      repos: input.repos,
      runId: input.runId,
      pipelineKind: 'topic-content',
      stage: input.stage,
      inputHash: promptInputHash,
      model: generationPolicy.modelId,
      status: 'success',
      trace,
    });
  } catch (err) {
    const failure = workflowFailureDetails(err, 'llm:upstream-transient');
    const trace = llmTrace.finalizeFailure(failure.code, failure.message);
    jobId = await recordLlmJob({
      repos: input.repos,
      runId: input.runId,
      pipelineKind: 'topic-content',
      stage: input.stage,
      inputHash: promptInputHash,
      model: generationPolicy.modelId,
      status: 'failed',
      trace,
      errorCode: failure.code,
      errorMessage: failure.message,
    });
    if (jobId) {
      await input.repos.stageCheckpoints.linkJob(input.runId, input.stage, jobId).catch(() => undefined);
    }
    await input.repos.stageCheckpoints.markFailed(input.runId, input.stage, failure.code, failure.message).catch((checkpointErr) => {
      createLogger({ runId: input.runId, deviceId: input.deviceId, pipelineKind: 'topic-content', stage: input.stage }).warn('stage_checkpoint.mark_failed.failed', {
        errorMessage: checkpointErr instanceof Error ? checkpointErr.message : String(checkpointErr),
      });
    });
    throw err;
  }

  try {
    return { payload: input.parse(raw), promptInputHash, jobId };
  } catch (err) {
    const failure = workflowFailureDetails(err, 'parse:zod-shape');
    await input.repos.stageCheckpoints.markFailed(input.runId, input.stage, failure.code, failure.message).catch((checkpointErr) => {
      createLogger({ runId: input.runId, deviceId: input.deviceId, pipelineKind: 'topic-content', stage: input.stage }).warn('stage_checkpoint.mark_failed.failed', {
        errorMessage: checkpointErr instanceof Error ? checkpointErr.message : String(checkpointErr),
      });
    });
    throw err;
  }
}

async function buildOrLoadTopicPlanningState(input: {
  step: WorkflowStep;
  repos: ReturnType<typeof makeRepos>;
  env: Env;
  runId: string;
  deviceId: string;
  snapshot: Record<string, unknown>;
  theoryArtifactId: string | null;
}): Promise<TopicPlanningState | null> {
  if (!input.theoryArtifactId) return null;

  const subjectId = requireString(input.snapshot.subject_id, 'snapshot.subject_id');
  const topicId = requireString(input.snapshot.topic_id, 'snapshot.topic_id');
  const sourceSpans = await loadTheorySourceSpansForPlanning(input.repos, input.snapshot, input.theoryArtifactId);
  if (sourceSpans.length === 0) {
    throw new WorkflowFail('precondition:missing-topic', 'topic-content planning requires topic theory source spans');
  }

  let conceptCheckpoint = await loadCompiledTopicConceptPlanCheckpoint({ repos: input.repos, runId: input.runId });
  if (conceptCheckpoint && !isTopicConceptPlanCheckpointReusable({
    checkpoint: conceptCheckpoint.payload,
    subjectId,
    topicId,
    sourceSpanIds: sourceSpans.map((span) => span.spanId),
  })) {
    conceptCheckpoint = null;
  }

  let concepts: CompiledTopicConceptSpec[];
  if (conceptCheckpoint) {
    concepts = conceptCheckpoint.payload.compiled_concepts;
  } else {
    const generationPolicy = await resolveGenerationJobPolicy(input.deviceId, TOPIC_CONCEPT_PLAN_ARTIFACT_KIND);
    const conceptSnapshot = buildTopicConceptPlanSnapshot({
      subjectId,
      topicId,
      topicTitle: requireString(input.snapshot.topic_title, 'snapshot.topic_title'),
      learningObjective: requireString(input.snapshot.learning_objective, 'snapshot.learning_objective'),
      sourceSpans,
      modelId: generationPolicy.modelId,
      capturedAt: new Date().toISOString(),
    });
    const generated = await runPlanningLlmStage<TopicConceptPlanArtifactPayload>({
      step: input.step,
      repos: input.repos,
      env: input.env,
      runId: input.runId,
      deviceId: input.deviceId,
      stage: TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE,
      jobKind: TOPIC_CONCEPT_PLAN_ARTIFACT_KIND,
      schemaVersion: TOPIC_CONCEPT_PLAN_SCHEMA_VERSION,
      snapshot: conceptSnapshot as unknown as Record<string, unknown>,
      responseFormat: topicPlanJsonSchemaResponseFormat(TOPIC_CONCEPT_PLAN_ARTIFACT_KIND),
      messages: buildTopicConceptPlanMessages(conceptSnapshot as unknown as Record<string, unknown>),
      parse: parseTopicConceptPlanPayload,
    });
    concepts = await compileTopicConceptPlan({ subjectId, topicId, sourceSpans, payload: generated.payload });
    conceptCheckpoint = await input.step.do(`persist:${TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE.replace(/:/g, '_')}`, WORKFLOW_STORAGE_STEP_RETRY, async (): Promise<any> => (
      persistCompiledTopicConceptPlanCheckpoint({
        repos: input.repos,
        runId: input.runId,
        deviceId: input.deviceId,
        subjectId,
        topicId,
        sourceSpanIds: sourceSpans.map((span) => span.spanId),
        planPayload: generated.payload,
        compiledConcepts: concepts,
      }) as unknown as Record<string, unknown>
    )) as unknown as PersistedTopicPlanCheckpoint<TopicConceptPlanCheckpointPayload>;
    if (generated.jobId) await input.repos.stageCheckpoints.linkJob(input.runId, TOPIC_CONCEPT_PLAN_CHECKPOINT_STAGE, generated.jobId).catch(() => undefined);
  }

  let cardCheckpoint = await loadCompiledTopicCardPlanCheckpoint({ repos: input.repos, runId: input.runId });
  if (cardCheckpoint && !isTopicCardPlanCheckpointReusable({
    checkpoint: cardCheckpoint.payload,
    subjectId,
    topicId,
    concepts,
  })) {
    cardCheckpoint = null;
  }

  let cardPlan: CompiledTopicCardPlan;
  if (cardCheckpoint) {
    cardPlan = {
      cardSpecs: cardCheckpoint.payload.compiled_card_specs,
      miniGameSpecs: cardCheckpoint.payload.compiled_mini_game_specs,
    };
  } else {
    const generationPolicy = await resolveGenerationJobPolicy(input.deviceId, TOPIC_CARD_PLAN_ARTIFACT_KIND);
    const cardSnapshot = buildTopicCardPlanSnapshot({
      subjectId,
      topicId,
      topicTitle: requireString(input.snapshot.topic_title, 'snapshot.topic_title'),
      learningObjective: requireString(input.snapshot.learning_objective, 'snapshot.learning_objective'),
      sourceSpans,
      concepts,
      modelId: generationPolicy.modelId,
      capturedAt: new Date().toISOString(),
    });
    const generated = await runPlanningLlmStage<TopicCardPlanArtifactPayload>({
      step: input.step,
      repos: input.repos,
      env: input.env,
      runId: input.runId,
      deviceId: input.deviceId,
      stage: TOPIC_CARD_PLAN_CHECKPOINT_STAGE,
      jobKind: TOPIC_CARD_PLAN_ARTIFACT_KIND,
      schemaVersion: TOPIC_CARD_PLAN_SCHEMA_VERSION,
      snapshot: cardSnapshot as unknown as Record<string, unknown>,
      responseFormat: topicPlanJsonSchemaResponseFormat(TOPIC_CARD_PLAN_ARTIFACT_KIND),
      messages: buildTopicCardPlanMessages(cardSnapshot as unknown as Record<string, unknown>),
      parse: parseTopicCardPlanPayload,
    });
    cardPlan = await compileTopicCardPlan({ subjectId, topicId, concepts, payload: generated.payload });
    cardCheckpoint = await input.step.do(`persist:${TOPIC_CARD_PLAN_CHECKPOINT_STAGE.replace(/:/g, '_')}`, WORKFLOW_STORAGE_STEP_RETRY, async (): Promise<any> => (
      persistCompiledTopicCardPlanCheckpoint({
        repos: input.repos,
        runId: input.runId,
        deviceId: input.deviceId,
        subjectId,
        topicId,
        concepts,
        planPayload: generated.payload,
        compiledPlan: cardPlan,
      }) as unknown as Record<string, unknown>
    )) as unknown as PersistedTopicPlanCheckpoint<TopicCardPlanCheckpointPayload>;
    if (generated.jobId) await input.repos.stageCheckpoints.linkJob(input.runId, TOPIC_CARD_PLAN_CHECKPOINT_STAGE, generated.jobId).catch(() => undefined);
  }

  if (!conceptCheckpoint) {
    throw new WorkflowFail('state:unexpected-workflow-error', 'topic concept-plan checkpoint was not available after planning');
  }
  if (!cardCheckpoint) {
    throw new WorkflowFail('state:unexpected-workflow-error', 'topic card-plan checkpoint was not available after planning');
  }

  return { sourceSpans, concepts, cardPlan, conceptCheckpoint, cardCheckpoint };
}

async function buildTopicCardPromptSnapshot(
  repos: ReturnType<typeof makeRepos>,
  snapshot: Record<string, unknown>,
  theoryArtifactId: string | null,
  preferredSourceSpanIds?: readonly string[],
): Promise<Record<string, unknown>> {
  if (hasStagePromptContext(snapshot)) return snapshot;
  if (!theoryArtifactId) {
    throw new WorkflowFail(
      'precondition:missing-topic',
      'topic-content card prompt construction requires either stage prompt context or a ready theory artifact',
    );
  }

  const artifact = await repos.artifacts.get(theoryArtifactId);
  if (!artifact) {
    throw new WorkflowFail('precondition:missing-topic', `topic-content theory artifact row not found: ${theoryArtifactId}`);
  }

  const payload = requireRecord(await repos.artifacts.getStorage(artifact.storage_key), `topic-content theory artifact ${theoryArtifactId}`);
  const subjectId = requireString(snapshot.subject_id, 'snapshot.subject_id');
  const topicId = requireString(snapshot.topic_id, 'snapshot.topic_id');
  const questionsByDifficulty = requireRecord(payload.coreQuestionsByDifficulty, 'topic-content theory artifact.coreQuestionsByDifficulty');
  const targetDifficulty = typeof snapshot.target_difficulty === 'number' ? snapshot.target_difficulty : 1;
  const syllabusQuestions = requireStringArray(questionsByDifficulty[String(targetDifficulty)], `topic-content theory artifact.coreQuestionsByDifficulty.${targetDifficulty}`);
  const sourceSpans = await buildTopicTheorySourceSpans({ subjectId, topicId, payload });
  const preferredIds = preferredSourceSpanIds === undefined ? [] : stableStringList(preferredSourceSpanIds);
  const preferredIdSet = new Set(preferredIds);
  const plannedSourceSpans = preferredIds.length > 0
    ? sourceSpans.filter((span) => preferredIdSet.has(span.spanId))
    : [];
  const selectedSourceSpans = plannedSourceSpans.length > 0
    ? plannedSourceSpans
    : selectRelevantTheorySourceSpans({ spans: sourceSpans, queries: syllabusQuestions });

  return {
    ...snapshot,
    theory_excerpt: selectedSourceSpans.length > 0
      ? formatTheorySourceSpansForPrompt(selectedSourceSpans)
      : requireString(payload.theory, 'topic-content theory artifact.theory'),
    theory_source_spans: topicTheorySourceSpansAsJson(selectedSourceSpans),
    syllabus_questions: syllabusQuestions,
    target_difficulty: targetDifficulty,
    grounding_source_count: selectedSourceSpans.length,
    grounding_source_selection: plannedSourceSpans.length > 0 ? 'compiled-plan' : 'lexical-fallback',
    has_authoritative_primary_source: false,
  };
}

function resolveWantedStages(
  snapshot: Record<string, unknown>,
  checkpoints: Array<{ stage: string; artifact_id: string | null }>,
): string[] {
  // Phase 3.6 P0 #1: Prefer `resume_from_stage` (set by the retry planner)
  // over `stage` (set by the initial submit). The retry route copies ready
  // parent checkpoints to the child run, so `resolveWantedStages` naturally
  // skips completed stages via the `persisted` set below.
  const stage = (snapshot.resume_from_stage as string) ?? (snapshot.stage as string) ?? 'full';
  const persisted = new Set(checkpoints.filter((c) => c.artifact_id).map((c) => c.stage));

  if (stage === 'theory') return persisted.has('theory') ? [] : ['theory'];
  if (stage === 'study-cards') {
    const stages: string[] = [];
    if (!persisted.has('theory')) stages.push('theory');
    if (!persisted.has('study-cards')) stages.push('study-cards');
    return stages;
  }
  if (stage === 'mini-games') {
    const stages: string[] = [];
    if (!persisted.has('theory')) stages.push('theory');
    if (!persisted.has('study-cards')) stages.push('study-cards');
    for (const gt of MINI_GAME_TYPES) {
      if (!persisted.has(`mini-games:${gt}`)) {
        stages.push(`mini-games:${gt}`);
      }
    }
    return stages;
  }

  const stages: string[] = [];
  if (!persisted.has('theory')) stages.push('theory');
  if (!persisted.has('study-cards')) stages.push('study-cards');
  for (const gt of MINI_GAME_TYPES) {
    if (!persisted.has(`mini-games:${gt}`)) {
      stages.push(`mini-games:${gt}`);
    }
  }
  return stages;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------
export class TopicContentWorkflow extends WorkflowEntrypoint<
  Env,
  { runId: string; deviceId: string }
> {
  async run(
    event: WorkflowEvent<{ runId: string; deviceId: string }>,
    step: WorkflowStep,
  ): Promise<void> {
    const { runId, deviceId } = event.payload;
    const repos = makeRepos(this.env);
    const logger = createLogger({ runId, deviceId, pipelineKind: 'topic-content', workflowName: 'topic-content-workflow' });
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

      const planOutcome = (await step.do('plan', async (): Promise<PlanOutcome> => {
        await repos.runs.transition(runId, 'planning');
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowStatusEventKey('planning'),
          buildRunStatusEvent('planning'),
        );

        const run = await repos.runs.load(runId);
        const snapshot = run.snapshot_json as Record<string, unknown>;
        const _inputHash = await inputHash(snapshot);

        const ckps = await repos.stageCheckpoints.byRun(runId);
        return {
          ok: true,
          snapshot,
          inputHash: _inputHash,
          checkpoints: ckps.map((c) => ({ stage: c.stage, artifact_id: c.artifact_id })),
        };
      })) as PlanOutcome;

      if (!planOutcome.ok) return;
      const { snapshot, inputHash: _inputHash, checkpoints } = planOutcome;
      await step.do('mark-topic-content-generating', WORKFLOW_STORAGE_STEP_RETRY, async () => {
        await setTopicGeneratingIfStudyPipeline(repos, deviceId, runId, snapshot);
      });
      const wantedStages = resolveWantedStages(snapshot, checkpoints);
      const bindParentArtifactHashes = snapshot.stage === 'full';
      let theoryArtifactId = checkpoints.find((c) => c.stage === 'theory')?.artifact_id ?? null;
      let theoryContentHash: string | undefined;
      let studyCardsContentHash: string | undefined;
      const studyCardsCheckpointArtifactId = checkpoints.find((c) => c.stage === 'study-cards')?.artifact_id ?? null;

      // ---- 2. THEORY ----
      if (wantedStages.includes('theory')) {
        await checkCancel('before-theory');

        const theoryResponseFormat = jsonSchemaResponseFormat('topic-theory');
        const theorySchemaVersion = (snapshot.schema_version as number) ?? topicTheorySchemaVersion;
        const theoryInputHash = await topicContentStageInputHash({
          snapshot,
          baseInputHash: _inputHash,
          stage: 'theory',
        });

        const theoryResult = (await useCachedStage(
          step, repos, runId, deviceId, 'theory', 'topic-theory', theoryInputHash, snapshot,
        )) ?? await runStage(
          step, repos, runId, deviceId, 'theory', 'topic-theory',
          snapshot, theoryInputHash, theorySchemaVersion,
          async (generationPolicy) => callTopicContent(
            {
              modelId: generationPolicy.modelId,
              messages: buildTopicTheoryMessages(snapshot),
              responseFormat: theoryResponseFormat,
              providerHealingRequested: generationPolicy.providerHealingRequested,
              temperature: generationPolicy.temperature,
              stage: 'theory',
            },
            this.env,
          ),
          (raw) => {
            const parseResult = strictParseArtifact('topic-theory', raw.text);
            if (!parseResult.ok) {
              throw new WorkflowFail(parseResult.failureCode, parseResult.message);
            }

            const semResult = semanticValidateArtifact('topic-theory', parseResult.payload);
            if (!semResult.ok) {
              throw new WorkflowFail(semResult.failureCode, semResult.message ?? 'semantic validation failed');
            }

            return parseResult.payload as Record<string, unknown>;
          },
        );
        theoryArtifactId = theoryResult.artifactId;
        theoryContentHash = theoryResult.contentHash;
      } else if (theoryArtifactId) {
        theoryContentHash = await loadStageArtifactContentHash(repos, theoryArtifactId, 'theory');
      }

      const downstreamStagesNeedPlanning = wantedStages.includes('study-cards') || wantedStages.some((stage) => stage.startsWith('mini-games:'));
      if (downstreamStagesNeedPlanning) await checkCancel('before-topic-planning');
      const planningState = downstreamStagesNeedPlanning
        ? await buildOrLoadTopicPlanningState({
          step,
          repos,
          env: this.env,
          runId,
          deviceId,
          snapshot,
          theoryArtifactId,
        })
        : null;
      const plannedCardSourceSpanIds = planningState ? sourceSpanIdsForStudyCardSpecs(planningState.cardPlan) : undefined;

      // ---- 3. STUDY CARDS ----
      if (wantedStages.includes('study-cards')) {
        await checkCancel('before-study-cards');

        const plannedCardSpecs = planningState
          ? compiledStudyCardSpecsForPrompt(planningState.cardPlan.cardSpecs)
          : [];

        if (plannedCardSpecs.length > 0) {
          const responseFormat = jsonSchemaResponseFormat('topic-card-content');
          const schemaVersion = (snapshot.schema_version as number) ?? topicCardContentSchemaVersion;
          const results = await Promise.all(plannedCardSpecs.map(async (plannedSpec) => {
            const perCardStage = `study-cards:${plannedSpec.card_spec_id}` as const;
            const parentContentHashes: Record<string, string> = { cardSpec: plannedSpec.card_spec_id };
            if (bindParentArtifactHashes && theoryContentHash) parentContentHashes.theory = theoryContentHash;
            if (bindParentArtifactHashes && planningState) parentContentHashes.cardPlan = planningState.cardCheckpoint.contentHash;
            const perCardInputHash = await topicContentStageInputHash({
              snapshot,
              baseInputHash: _inputHash,
              stage: perCardStage,
              parentContentHashes,
            });
            const basePromptSnapshot = await buildTopicCardPromptSnapshot(repos, snapshot, theoryArtifactId, plannedSpec.source_span_ids);
            const promptSnapshot = {
              ...basePromptSnapshot,
              pipeline_kind: 'topic-card-content',
              compiled_study_card_specs: [plannedSpec],
              grounding_source_selection: 'compiled-card-spec',
            };

            return (await useCachedStage(
              step, repos, runId, deviceId, perCardStage, 'topic-card-content', perCardInputHash, promptSnapshot,
            )) ?? await runStage(
              step, repos, runId, deviceId, perCardStage, 'topic-card-content',
              promptSnapshot, perCardInputHash, schemaVersion,
              async (generationPolicy) => callTopicContent(
                {
                  modelId: generationPolicy.modelId,
                  messages: buildTopicCardContentMessages(promptSnapshot),
                  responseFormat,
                  providerHealingRequested: generationPolicy.providerHealingRequested,
                  temperature: generationPolicy.temperature,
                  stage: perCardStage,
                },
                this.env,
              ),
              (raw) => {
                const parseResult = strictParseArtifact('topic-card-content', raw.text);
                if (!parseResult.ok) {
                  throw new WorkflowFail(parseResult.failureCode, parseResult.message);
                }

                const semResult = semanticValidateArtifact('topic-card-content', parseResult.payload);
                if (!semResult.ok) {
                  throw new WorkflowFail(semResult.failureCode, semResult.message ?? 'semantic validation failed');
                }

                return parseResult.payload as Record<string, unknown>;
              },
            );
          }));
          studyCardsContentHash = await contentHash(results.map((result) => result.contentHash).sort());
          await step.do('mark-topic-ready-after-card-content', WORKFLOW_STORAGE_STEP_RETRY, async () => {
            await setTopicContentStatus(repos, deviceId, runId, snapshot, 'ready');
          });
        } else {
          const cardsResponseFormat = jsonSchemaResponseFormat('topic-study-cards');
          const cardsSchemaVersion = (snapshot.schema_version as number) ?? topicStudyCardsSchemaVersion;
          const studyCardsParentContentHashes: Record<string, string> = {};
          if (bindParentArtifactHashes && theoryContentHash) studyCardsParentContentHashes.theory = theoryContentHash;
          const studyCardsInputHash = await topicContentStageInputHash({
            snapshot,
            baseInputHash: _inputHash,
            stage: 'study-cards',
            parentContentHashes: Object.keys(studyCardsParentContentHashes).length > 0 ? studyCardsParentContentHashes : undefined,
          });
          const studyCardPromptSnapshot = await buildTopicCardPromptSnapshot(repos, snapshot, theoryArtifactId, plannedCardSourceSpanIds);

          const studyCardsResult = (await useCachedStage(
            step, repos, runId, deviceId, 'study-cards', 'topic-study-cards', studyCardsInputHash, studyCardPromptSnapshot,
          )) ?? await runStage(
            step, repos, runId, deviceId, 'study-cards', 'topic-study-cards',
            studyCardPromptSnapshot, studyCardsInputHash, cardsSchemaVersion,
            async (generationPolicy) => callTopicContent(
              {
                modelId: generationPolicy.modelId,
                messages: buildTopicStudyCardsMessages(studyCardPromptSnapshot),
                responseFormat: cardsResponseFormat,
                providerHealingRequested: generationPolicy.providerHealingRequested,
                temperature: generationPolicy.temperature,
                stage: 'study-cards',
              },
              this.env,
            ),
            (raw) => {
              const parseResult = strictParseArtifact('topic-study-cards', raw.text);
              if (!parseResult.ok) {
                throw new WorkflowFail(parseResult.failureCode, parseResult.message);
              }

              const existingStems = Array.isArray(snapshot.existing_concept_stems)
                ? (snapshot.existing_concept_stems as string[])
                : undefined;
              const ctx = existingStems ? { existingConceptStems: existingStems } : undefined;
              const semResult = semanticValidateArtifact('topic-study-cards', parseResult.payload, ctx);
              if (!semResult.ok) {
                throw new WorkflowFail(semResult.failureCode, semResult.message ?? 'semantic validation failed');
              }

              return parseResult.payload as Record<string, unknown>;
            },
          );
          studyCardsContentHash = studyCardsResult.contentHash;
        }
      } else if (studyCardsCheckpointArtifactId) {
        studyCardsContentHash = await loadStageArtifactContentHash(repos, studyCardsCheckpointArtifactId, 'study-cards');
      }

      // ---- 4. MINI-GAMES (plan-gated legacy broad artifacts) ----
      const miniStages = resolvePlannedTopicMiniGameStages({
        wantedStages,
        cardPlan: planningState?.cardPlan ?? null,
      });
      if (miniStages.length > 0) {
        await checkCancel('before-mini-games');

        await Promise.all(
          miniStages.map(async (rawMiniStage) => {
            const miniStage = rawMiniStage as TopicMiniGameStage;
            const gameType = miniStage.replace('mini-games:', '') as MiniGameType;
            const kind = MINI_GAME_ARTIFACT_KINDS[gameType];
            const schemaVersion = MINI_GAME_SCHEMA_VERSIONS[gameType];
            const responseFormat = jsonSchemaResponseFormat(kind);
            const parentContentHashes: Record<string, string> = {};
            if (bindParentArtifactHashes && theoryContentHash) parentContentHashes.theory = theoryContentHash;
            if (bindParentArtifactHashes && studyCardsContentHash) parentContentHashes.studyCards = studyCardsContentHash;
            if (bindParentArtifactHashes && planningState) parentContentHashes.cardPlan = planningState.cardCheckpoint.contentHash;
            const miniGameInputHash = await topicContentStageInputHash({
              snapshot,
              baseInputHash: _inputHash,
              stage: miniStage,
              parentContentHashes: Object.keys(parentContentHashes).length > 0 ? parentContentHashes : undefined,
            });
            const plannedMiniGameSpecs = planningState
              ? compiledMiniGameSpecsForType(planningState.cardPlan, gameType)
              : [];
            const promptSnapshot = await buildTopicCardPromptSnapshot(repos, {
              ...snapshot,
              pipeline_kind: kind,
            }, theoryArtifactId, planningState ? sourceSpanIdsForMiniGameType(planningState.cardPlan, gameType) : undefined);
            const miniGamePromptSnapshot = plannedMiniGameSpecs.length > 0
              ? {
                ...promptSnapshot,
                compiled_mini_game_specs: miniGameSpecsForPrompt(plannedMiniGameSpecs),
                grounding_source_selection: 'compiled-mini-game-specs',
              }
              : promptSnapshot;

            return (await useCachedStage(
              step, repos, runId, deviceId, miniStage, kind, miniGameInputHash, miniGamePromptSnapshot,
            )) ?? await runStage(
              step, repos, runId, deviceId, miniStage, kind,
              miniGamePromptSnapshot, miniGameInputHash, schemaVersion,
              async (generationPolicy) => {
                return callTopicContent(
                  {
                    modelId: generationPolicy.modelId,
                    messages: buildTopicMiniGameMessages(miniGamePromptSnapshot),
                    responseFormat,
                    providerHealingRequested: generationPolicy.providerHealingRequested,
                    temperature: generationPolicy.temperature,
                    stage: miniStage,
                  },
                  this.env,
                );
              },
              (raw) => {
                const parseResult = strictParseArtifact(kind, raw.text);
                if (!parseResult.ok) {
                  throw new WorkflowFail(parseResult.failureCode, parseResult.message);
                }

                const semResult = semanticValidateArtifact(kind, parseResult.payload);
                if (!semResult.ok) {
                  throw new WorkflowFail(semResult.failureCode, semResult.message ?? 'semantic validation failed');
                }

                return parseResult.payload as Record<string, unknown>;
              },
            );
          }),
        );
      }

      // ---- 5. READY ----
      await step.do('ready', WORKFLOW_TERMINAL_STEP_RETRY, async () => {
        await repos.runs.markReady(runId);
        logger.info('workflow.terminal.ready');
        await appendWorkflowEventOnce(repos.runs, runId, deviceId, workflowTerminalEventKey('completed'), buildRunCompletedEvent());
      });
    } catch (err) {
      if (err instanceof WorkflowAbort) {
        const run = await repos.runs.load(runId);
        await step.do('clear-topic-content-generating-after-cancel', WORKFLOW_TERMINAL_STEP_RETRY, async () => {
          await clearStaleGeneratingTopicStatus(repos, deviceId, runId, run.snapshot_json as Record<string, unknown>);
        });
        return;
      }
      const failure = classifyWorkflowTerminalError(err);
      await step.do('fail', WORKFLOW_TERMINAL_STEP_RETRY, async () => {
        const run = await repos.runs.load(runId);
        await clearStaleGeneratingTopicStatus(repos, deviceId, runId, run.snapshot_json as Record<string, unknown>);
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
