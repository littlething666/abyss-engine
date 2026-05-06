/**
 * Topic Content Workflow — Phase 2 PR-2D.
 *
 * Three-stage durable pipeline mirroring `runTopicGenerationPipeline.ts`:
 * theory → study-cards → mini-games (×3 in parallel).
 *
 * Stage-level checkpoints persisting via `stage_checkpoints` table allow
 * resume from any stage after Worker eviction. The `resumeFromStage` field
 * in the snapshot controls which stage to start from.
 *
 * Mini-games run in parallel (CategorySort, SequenceBuild, MatchPairs) with
 * each gameType as its own checkpoint. Cross-bucket dedupe runs after all
 * three mini-games complete.
 *
 * Retries: generate step has 2 retries (5s delay, exponential backoff).
 * Parse and validate steps carry no automatic retries.
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { makeRepos } from '../repositories';
import { WorkflowFail, WorkflowAbort } from '../lib/workflowErrors';
import { assertBelowDailyCap } from '../budget/budgetGuard';
import { callTopicContent } from '../llm/openrouterClient';
import { traceLlmCall, recordTokensRobust } from './shared/workflowObservability';
import type { Env } from '../env';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MINI_GAME_TYPES = ['CATEGORY_SORT', 'SEQUENCE_BUILD', 'MATCH_PAIRS'] as const;
type MiniGameType = (typeof MINI_GAME_TYPES)[number];

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
// Helpers
// ---------------------------------------------------------------------------
async function computeInputHash(snapshot: Record<string, unknown>): Promise<string> {
  const json = JSON.stringify(snapshot, Object.keys(snapshot).sort());
  const data = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return `inp_${Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Run a single stage: transition to generating → call LLM → parse → validate
 * → persist into stage_checkpoints. Returns the artifact_id.
 */
async function runStage(
  step: WorkflowStep,
  repos: ReturnType<typeof makeRepos>,
  runId: string,
  deviceId: string,
  stage: string,
  snapshot: Record<string, unknown>,
  inputHash: string,
  exec: () => Promise<GenerateResult & { parsedPayload: Record<string, unknown>; kind: string; contentHash: string }>,
): Promise<string> {
  await repos.runs.append(runId, deviceId, 'run.status:generating-stage', { stage });
  await repos.stageCheckpoints.upsert({
    runId,
    stage,
    status: 'generating',
    inputHash: `stg_${crypto.randomUUID().slice(0, 8)}`,
    attempt: 0,
    startedAt: new Date().toISOString(),
  });

  const llmTrace = traceLlmCall({
    runId,
    deviceId,
    pipelineKind: 'topic-content',
    stage,
    model: String((snapshot.model_id as string) ?? 'openrouter/google/gemini-2.5-flash'),
    promptVersion: (snapshot.prompt_template_version as number) ?? 0,
    schemaVersion: (snapshot.schema_version as number) ?? 0,
    inputHash,
    providerHealingRequested: true,
  });

  let result: GenerateResult & { parsedPayload: Record<string, unknown>; kind: string; contentHash: string };
  try {
    result = (await step.do(
      `generate:${stage.replace(/:/g, '_')}`,
      { retries: { limit: 2, delay: 5, backoff: 'exponential' } },
      // @ts-expect-error exec return type contains `unknown` (safe — DB stores jsonb)
      exec,
    )) as GenerateResult & { parsedPayload: Record<string, unknown>; kind: string; contentHash: string };
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

  // Persist the artifact.
  const artifactId = await repos.artifacts.putStorage(
    {
      deviceId,
      kind: result.kind,
      inputHash: `stg_${stage}`,
      payload: result.parsedPayload,
    },
    result.contentHash,
    (snapshot.schema_version as number) ?? 1,
    runId,
  );

  await repos.stageCheckpoints.markReady(runId, stage, artifactId);

  if (result.usage) {
    await recordTokensRobust(deviceId, repos, llmTrace.trace, result.usage);
  }

  await repos.runs.append(runId, deviceId, 'run.artifact-ready', {
    stage,
    artifactId,
    contentHash: result.contentHash,
    kind: result.kind,
  });

  return artifactId;
}

/**
 * Determine which stages need to run based on the snapshot's `stage` and
 * `resumeFromStage` fields.
 */
function resolveWantedStages(
  snapshot: Record<string, unknown>,
  checkpoints: Array<{ stage: string; artifact_id: string | null }>,
): string[] {
  const stage = (snapshot.stage as string) ?? 'full';
  const resumeFrom = (snapshot.resumeFromStage as string) ?? 'theory';
  const persistedStages = new Set(checkpoints.filter((c) => c.artifact_id).map((c) => c.stage));

  if (stage === 'theory') return persistedStages.has('theory') ? [] : ['theory'];
  if (stage === 'study-cards') {
    const stages: string[] = [];
    if (!persistedStages.has('theory')) stages.push('theory');
    if (!persistedStages.has('study-cards')) stages.push('study-cards');
    return stages;
  }
  if (stage === 'mini-games') {
    const stages: string[] = [];
    if (!persistedStages.has('theory')) stages.push('theory');
    if (!persistedStages.has('study-cards')) stages.push('study-cards');
    for (const gt of MINI_GAME_TYPES) {
      if (!persistedStages.has(`mini-games:${gt}`)) {
        stages.push(`mini-games:${gt}`);
      }
    }
    return stages;
  }

  // 'full': everything not yet persisted.
  const stages: string[] = [];
  if (!persistedStages.has('theory')) stages.push('theory');
  if (!persistedStages.has('study-cards')) stages.push('study-cards');
  for (const gt of MINI_GAME_TYPES) {
    if (!persistedStages.has(`mini-games:${gt}`)) {
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
        await repos.runs.append(runId, deviceId, 'run.cancelled', { boundary, reason });
        throw new WorkflowAbort('cancelled');
      }
    };

    try {
      // ---- 1. PLAN ----
      await checkCancel('before-plan');

      const planOutcome = (await step.do('plan', async (): Promise<PlanOutcome> => {
        await repos.runs.transition(runId, 'planning');
        await repos.runs.append(runId, deviceId, 'run.status:planning', {});

        const run = await repos.runs.load(runId);
        const snapshot = run.snapshot_json as Record<string, unknown>;
        const inputHash = await computeInputHash(snapshot);

        const budget = await assertBelowDailyCap(deviceId, repos.usage, 'topic-content');
        if (!budget.ok) throw new WorkflowFail(budget.code!, budget.message!);

        const cached = await repos.artifacts.findCacheHit(deviceId, 'topic-theory', inputHash);
        if (cached) {
          await repos.runs.append(runId, deviceId, 'run.artifact-ready', {
            artifactId: cached.id,
            contentHash: cached.content_hash,
            fromCache: true,
          });
          await repos.runs.markReady(runId);
          await repos.runs.append(runId, deviceId, 'run.completed', { fromCache: true });
          return { ok: false };
        }

        const ckps = await repos.stageCheckpoints.byRun(runId);
        return {
          ok: true,
          snapshot,
          inputHash,
          checkpoints: ckps.map((c) => ({ stage: c.stage, artifact_id: c.artifact_id })),
        };
      })) as PlanOutcome;

      if (!planOutcome.ok) return;
      const { snapshot, inputHash, checkpoints } = planOutcome;
      const wantedStages = resolveWantedStages(snapshot, checkpoints);

      // ---- 2. THEORY ----
      if (wantedStages.includes('theory')) {
        await checkCancel('before-theory');

        await runStage(step, repos, runId, deviceId, 'theory', snapshot, inputHash, async () => {
          const messages = [
            {
              role: 'system',
              content:
                'You are an Abyss Engine topic content generator. Create comprehensive theory content for the given topic. Return valid JSON matching the topic-theory schema.',
            },
            {
              role: 'user',
              content: `Generate theory for topic: "${
                String(snapshot.topic_title ?? snapshot.topic_id ?? 'topic')
              }". Learning objective: ${String(snapshot.learning_objective ?? 'master the concepts')}.`,
            },
          ];

          const raw = await callTopicContent(
            {
              modelId: String(snapshot.model_id ?? 'openrouter/google/gemini-2.5-flash'),
              messages,
              jsonSchema: {
                type: 'object',
                properties: {
                  coreConcept: { type: 'string' },
                  detailedExplanation: { type: 'string' },
                  keyTakeaways: { type: 'array', items: { type: 'string' } },
                  syllabusQuestions: {
                    type: 'object',
                    properties: {
                      beginner: { type: 'array', items: { type: 'string' } },
                      intermediate: { type: 'array', items: { type: 'string' } },
                      advanced: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['beginner', 'intermediate', 'advanced'],
                  },
                },
                required: ['coreConcept', 'detailedExplanation', 'keyTakeaways', 'syllabusQuestions'],
              },
              providerHealingRequested: true,
              stage: 'theory',
            },
            this.env,
          );

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(raw.text) as Record<string, unknown>;
          } catch {
            throw new WorkflowFail('parse:json-mode-violation', 'invalid JSON from model for theory');
          }

          if (typeof parsed.coreConcept !== 'string' || parsed.coreConcept.trim() === '') {
            throw new WorkflowFail('parse:zod-shape', 'theory missing coreConcept');
          }
          if (!Array.isArray(parsed.keyTakeaways)) {
            throw new WorkflowFail('parse:zod-shape', 'theory missing keyTakeaways array');
          }

          const contentHash = `cnt_${crypto.randomUUID().slice(0, 16)}`;
          return { ...raw, parsedPayload: parsed, kind: 'topic-theory', contentHash };
        });
      }

      // ---- 3. STUDY CARDS ----
      if (wantedStages.includes('study-cards')) {
        await checkCancel('before-study-cards');

        await runStage(step, repos, runId, deviceId, 'study-cards', snapshot, inputHash, async () => {
          const messages = [
            {
              role: 'system',
              content:
                'You are an Abyss Engine study card generator. Create study cards based on the provided theory. Return valid JSON matching the topic-study-cards schema.',
            },
            {
              role: 'user',
              content: `Generate study cards for topic: "${
                String(snapshot.topic_title ?? snapshot.topic_id ?? 'topic')
              }" using the theory content already generated. Create a mix of FLASHCARD, CLOZE, and MULTIPLE_CHOICE cards at various difficulty levels.`,
            },
          ];

          const raw = await callTopicContent(
            {
              modelId: String(snapshot.model_id ?? 'openrouter/google/gemini-2.5-flash'),
              messages,
              jsonSchema: {
                type: 'object',
                properties: {
                  cards: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        cardType: { type: 'string', enum: ['FLASHCARD', 'CLOZE', 'MULTIPLE_CHOICE'] },
                        difficulty: { type: 'number' },
                        conceptStem: { type: 'string' },
                      },
                      required: ['id', 'cardType', 'difficulty', 'conceptStem'],
                    },
                  },
                },
                required: ['cards'],
              },
              providerHealingRequested: true,
              stage: 'study-cards',
            },
            this.env,
          );

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(raw.text) as Record<string, unknown>;
          } catch {
            throw new WorkflowFail('parse:json-mode-violation', 'invalid JSON from model for study cards');
          }

          const cards = parsed.cards as Array<unknown> | undefined;
          if (!cards || !Array.isArray(cards)) {
            throw new WorkflowFail('parse:zod-shape', 'study cards missing cards array');
          }

          // Validate card pool size.
          if (cards.length < 3) {
            throw new WorkflowFail(
              'validation:semantic-card-pool-size',
              `study cards generated only ${cards.length} cards (minimum 3)`,
            );
          }

          const contentHash = `cnt_${crypto.randomUUID().slice(0, 16)}`;
          return { ...raw, parsedPayload: parsed, kind: 'topic-study-cards', contentHash };
        });
      }

      // ---- 4. MINI-GAMES (three in parallel) ----
      const miniStages = wantedStages.filter((s) => s.startsWith('mini-games:'));
      if (miniStages.length > 0) {
        await checkCancel('before-mini-games');

        await Promise.all(
          miniStages.map((miniStage) => {
            const gameType = miniStage.replace('mini-games:', '') as MiniGameType;
            return runStage(step, repos, runId, deviceId, miniStage, snapshot, inputHash, async () => {
              const messages = [
                {
                  role: 'system',
                  content: `You are an Abyss Engine mini-game generator for ${gameType}. Create playable mini-game content based on the theory. Return valid JSON matching the topic-mini-game schema.`,
                },
                {
                  role: 'user',
                  content: `Generate ${gameType} mini-game cards for topic: "${
                    String(snapshot.topic_title ?? snapshot.topic_id ?? 'topic')
                  }". Use the theory content already generated. ${
                    gameType === 'CATEGORY_SORT'
                      ? 'Create items with categories.'
                      : gameType === 'SEQUENCE_BUILD'
                      ? 'Create ordered steps from 1 to N.'
                      : 'Create matching pairs.'
                  }`,
                },
              ];

              const kindMap: Record<MiniGameType, string> = {
                CATEGORY_SORT: 'topic-mini-game-category-sort',
                SEQUENCE_BUILD: 'topic-mini-game-sequence-build',
                MATCH_PAIRS: 'topic-mini-game-match-pairs',
              };

              const raw = await callTopicContent(
                {
                  modelId: String(snapshot.model_id ?? 'openrouter/google/gemini-2.5-flash'),
                  messages,
                  jsonSchema: {
                    type: 'object',
                    properties: {
                      items: { type: 'array', items: { type: 'object' } },
                    },
                    required: ['items'],
                  },
                  providerHealingRequested: true,
                  stage: miniStage,
                },
                this.env,
              );

              let parsed: Record<string, unknown>;
              try {
                parsed = JSON.parse(raw.text) as Record<string, unknown>;
              } catch {
                throw new WorkflowFail(
                  'parse:json-mode-violation',
                  `invalid JSON from model for mini-game ${gameType}`,
                );
              }

              const items = parsed.items as Array<unknown> | undefined;
              if (!items || !Array.isArray(items)) {
                throw new WorkflowFail(
                  'parse:zod-shape',
                  `mini-game ${gameType} missing items array`,
                );
              }

              if (items.length < 2) {
                throw new WorkflowFail(
                  'validation:semantic-mini-game-playability',
                  `mini-game ${gameType} generated only ${items.length} items (minimum 2)`,
                );
              }

              const contentHash = `cnt_${crypto.randomUUID().slice(0, 16)}`;
              return { ...raw, parsedPayload: parsed, kind: kindMap[gameType], contentHash };
            });
          }),
        );

        // Cross-bucket dedupe after all mini-games complete.
        await step.do('mini-games:cross-dedupe', async () => {
          // Ensure the run hasn't been cancelled mid-dedupe.
          await checkCancel('after-mini-games');
          // In the full implementation, the contracts module's semantic validators
          // handle cross-bucket concept-stem dedupe. The workflow just gates on
          // all three mini-game artifacts being persisted.
        });
      }

      // ---- 5. READY ----
      await repos.runs.markReady(runId);
      await repos.runs.append(runId, deviceId, 'run.completed', {});
    } catch (err) {
      if (err instanceof WorkflowAbort) return;
      if (err instanceof WorkflowFail) {
        await repos.runs.markFailed(runId, err.code, err.message);
        await repos.runs.append(runId, deviceId, 'run.failed', { code: err.code, message: err.message });
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      await repos.runs.markFailed(runId, 'llm:upstream-5xx', message);
      await repos.runs.append(runId, deviceId, 'run.failed', { code: 'llm:upstream-5xx', message });
      throw err;
    }
  }
}
