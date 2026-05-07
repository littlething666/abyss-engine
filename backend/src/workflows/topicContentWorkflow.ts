/**
 * Topic Content Workflow — Phase 2 PR-2D / Phase 3.6.
 *
 * Three-stage durable pipeline mirroring `runTopicGenerationPipeline.ts`:
 * theory → study-cards → mini-games (×3 in parallel).
 *
 * Phase 3.6: Budget reserved at route level (single owner). Typed event
 * builders and transport statuses throughout.
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { makeRepos } from '../repositories';
import { WorkflowFail, WorkflowAbort } from '../lib/workflowErrors';
import { callTopicContent } from '../llm/openrouterClient';
import { traceLlmCall, recordTokensRobust } from './shared/workflowObservability';
import {
  resolveGenerationJobPolicy,
  type BackendGenerationJobKind,
  type ResolvedGenerationJobPolicy,
} from '../generationPolicy';
import {
  buildTopicMiniGameMessages,
  buildTopicStudyCardsMessages,
  buildTopicTheoryMessages,
} from '../prompts/generationPrompts';
import {
  inputHash,
  contentHash,
  strictParseArtifact,
  semanticValidateArtifact,
  jsonSchemaResponseFormat,
  topicTheorySchemaVersion,
  topicStudyCardsSchemaVersion,
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MINI_GAME_TYPES = ['CATEGORY_SORT', 'SEQUENCE_BUILD', 'MATCH_PAIRS'] as const;
type MiniGameType = (typeof MINI_GAME_TYPES)[number];

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
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
}

interface StageRunResult {
  artifactId: string;
  contentHash: string;
  kind: ArtifactKind;
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
  exec: (generationPolicy: ResolvedGenerationJobPolicy) => Promise<GenerateResult & { parsedPayload: Record<string, unknown> }>,
): Promise<StageRunResult> {
  await repos.runs.appendTyped(runId, deviceId,
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

  let result: GenerateResult & { parsedPayload: Record<string, unknown> };
  try {
    result = (await step.do(
      `generate:${stage.replace(/:/g, '_')}`,
      { retries: { limit: 2, delay: 5, backoff: 'exponential' } },
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

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new WorkflowFail('precondition:missing-topic', `${label} must be an array of non-empty strings`);
  }
  return [...value] as string[];
}

function hasStagePromptContext(snapshot: Record<string, unknown>): boolean {
  return typeof snapshot.theory_excerpt === 'string' && Array.isArray(snapshot.syllabus_questions);
}

async function buildTopicCardPromptSnapshot(
  repos: ReturnType<typeof makeRepos>,
  snapshot: Record<string, unknown>,
  theoryArtifactId: string | null,
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
  const questionsByDifficulty = requireRecord(payload.coreQuestionsByDifficulty, 'topic-content theory artifact.coreQuestionsByDifficulty');
  const targetDifficulty = typeof snapshot.target_difficulty === 'number' ? snapshot.target_difficulty : 1;
  const syllabusQuestions = requireStringArray(questionsByDifficulty[String(targetDifficulty)], `topic-content theory artifact.coreQuestionsByDifficulty.${targetDifficulty}`);

  return {
    ...snapshot,
    theory_excerpt: requireString(payload.theory, 'topic-content theory artifact.theory'),
    syllabus_questions: syllabusQuestions,
    target_difficulty: targetDifficulty,
    grounding_source_count: 0,
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

        const cached = await repos.artifacts.findCacheHit(deviceId, 'topic-theory', _inputHash);
        if (cached) {
          await repos.runs.appendTyped(runId, deviceId,
            buildArtifactReadyEvent({
              artifactId: cached.id,
              kind: 'topic-theory',
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
      const wantedStages = resolveWantedStages(snapshot, checkpoints);
      let theoryArtifactId = checkpoints.find((c) => c.stage === 'theory')?.artifact_id ?? null;

      // ---- 2. THEORY ----
      if (wantedStages.includes('theory')) {
        await checkCancel('before-theory');

        const theoryResponseFormat = jsonSchemaResponseFormat('topic-theory');
        const theorySchemaVersion = (snapshot.schema_version as number) ?? topicTheorySchemaVersion;

        const theoryResult = await runStage(
          step, repos, runId, deviceId, 'theory', 'topic-theory',
          snapshot, _inputHash, theorySchemaVersion,
          async (generationPolicy) => {
            const raw = await callTopicContent(
              {
                modelId: generationPolicy.modelId,
                messages: buildTopicTheoryMessages(snapshot),
                responseFormat: theoryResponseFormat,
                providerHealingRequested: generationPolicy.providerHealingRequested,
                stage: 'theory',
              },
              this.env,
            );

            const parseResult = strictParseArtifact('topic-theory', raw.text);
            if (!parseResult.ok) {
              throw new WorkflowFail(parseResult.failureCode, parseResult.message);
            }

            const semResult = semanticValidateArtifact('topic-theory', parseResult.payload);
            if (!semResult.ok) {
              throw new WorkflowFail(semResult.failureCode, semResult.message ?? 'semantic validation failed');
            }

            return { ...raw, parsedPayload: parseResult.payload as Record<string, unknown> };
          },
        );
        theoryArtifactId = theoryResult.artifactId;
      }

      // ---- 3. STUDY CARDS ----
      if (wantedStages.includes('study-cards')) {
        await checkCancel('before-study-cards');

        const cardsResponseFormat = jsonSchemaResponseFormat('topic-study-cards');
        const cardsSchemaVersion = (snapshot.schema_version as number) ?? topicStudyCardsSchemaVersion;

        await runStage(
          step, repos, runId, deviceId, 'study-cards', 'topic-study-cards',
          snapshot, _inputHash, cardsSchemaVersion,
          async (generationPolicy) => {
            const promptSnapshot = await buildTopicCardPromptSnapshot(repos, snapshot, theoryArtifactId);

            const raw = await callTopicContent(
              {
                modelId: generationPolicy.modelId,
                messages: buildTopicStudyCardsMessages(promptSnapshot),
                responseFormat: cardsResponseFormat,
                providerHealingRequested: generationPolicy.providerHealingRequested,
                stage: 'study-cards',
              },
              this.env,
            );

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

            return { ...raw, parsedPayload: parseResult.payload as Record<string, unknown> };
          },
        );
      }

      // ---- 4. MINI-GAMES (three in parallel) ----
      const miniStages = wantedStages.filter((s) => s.startsWith('mini-games:'));
      if (miniStages.length > 0) {
        await checkCancel('before-mini-games');

        await Promise.all(
          miniStages.map((miniStage) => {
            const gameType = miniStage.replace('mini-games:', '') as MiniGameType;
            const kind = MINI_GAME_ARTIFACT_KINDS[gameType];
            const schemaVersion = MINI_GAME_SCHEMA_VERSIONS[gameType];
            const responseFormat = jsonSchemaResponseFormat(kind);

            return runStage(
              step, repos, runId, deviceId, miniStage, kind,
              snapshot, _inputHash, schemaVersion,
              async (generationPolicy) => {
                const promptSnapshot = await buildTopicCardPromptSnapshot(repos, {
                  ...snapshot,
                  pipeline_kind: kind,
                }, theoryArtifactId);

                const raw = await callTopicContent(
                  {
                    modelId: generationPolicy.modelId,
                    messages: buildTopicMiniGameMessages(promptSnapshot),
                    responseFormat,
                    providerHealingRequested: generationPolicy.providerHealingRequested,
                    stage: miniStage,
                  },
                  this.env,
                );

                const parseResult = strictParseArtifact(kind, raw.text);
                if (!parseResult.ok) {
                  throw new WorkflowFail(parseResult.failureCode, parseResult.message);
                }

                const semResult = semanticValidateArtifact(kind, parseResult.payload);
                if (!semResult.ok) {
                  throw new WorkflowFail(semResult.failureCode, semResult.message ?? 'semantic validation failed');
                }

                return { ...raw, parsedPayload: parseResult.payload as Record<string, unknown> };
              },
            );
          }),
        );
      }

      // ---- 5. READY ----
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
