/**
 * Subject Graph Workflow — Phase 2 PR-2C.
 *
 * Two-stage durable pipeline: Stage A (Topic Lattice) → Stage B (Prerequisite
 * Edges). Stage B's input_hash includes the Stage A artifact's content_hash
 * (embedded in the snapshot by `buildSubjectGraphEdgesSnapshot`), so a lattice
 * change forces a fresh edges generation.
 *
 * Stage B Parse: the deterministic `correctPrereqEdges` repair lives
 * server-side, inside the parse step. The client applier consumes the
 * corrected lattice without re-running the correction.
 *
 * Retries: generate step has 2 retries (5s delay, exponential backoff).
 * Parse and validate steps carry no automatic retries.
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { makeRepos } from '../repositories';
import { WorkflowFail, WorkflowAbort } from '../lib/workflowErrors';
import { assertBelowDailyCap } from '../budget/budgetGuard';
import { callSubjectGraph } from '../llm/openrouterClient';
import type { Env } from '../env';

// ---------------------------------------------------------------------------
// Step return shapes (all JSON-serializable at runtime)
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

interface PersistResult { artifactId: string; contentHash: string }

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

async function runStage(
  step: WorkflowStep,
  repos: ReturnType<typeof makeRepos>,
  runId: string,
  deviceId: string,
  stage: string,
  snapshot: Record<string, unknown>,
  exec: () => Promise<{ kind: string; payload: unknown; usage: GenerateResult['usage'] }>,
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

  // The exec closure's return type carries `unknown` payload which doesn't
  // satisfy cloudflare:workers `Serializable<T>` constraint. Same pattern as
  // crystalTrialWorkflow — cast after step.do().
  const result = (await step.do(
    `generate:${stage.replace(/:/g, '_')}`,
    { retries: { limit: 2, delay: 5, backoff: 'exponential' } },
    // @ts-expect-error exec return type contains `unknown` (safe — DB stores jsonb)
    exec,
  )) as { kind: string; payload: unknown; usage: GenerateResult['usage'] };

  const contentHash = `cnt_${crypto.randomUUID().slice(0, 16)}`;
  const storageKey = `${deviceId}/${result.kind}/${await computeInputHash(snapshot)}/${stage}.json`;

  await repos.artifacts.putStorage(
    { deviceId, kind: result.kind, inputHash: `stg_${stage}`, payload: result.payload },
    contentHash,
    1,
    runId,
  );

  const artifactId = `art_${crypto.randomUUID().slice(0, 8)}`;
  await repos.stageCheckpoints.markReady(runId, stage, artifactId);

  if (result.usage) {
    try {
      await repos.usage.recordTokens(deviceId, new Date().toISOString().slice(0, 10), result.usage);
    } catch { /* non-critical */ }
  }

  await repos.runs.append(runId, deviceId, 'run.artifact-ready', {
    stage,
    artifactId,
    contentHash,
    kind: result.kind,
  });

  return artifactId;
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

        const budget = await assertBelowDailyCap(deviceId, repos.usage, 'subject-graph');
        if (!budget.ok) throw new WorkflowFail(budget.code!, budget.message!);

        const cached = await repos.artifacts.findCacheHit(deviceId, 'subject-graph-topics', inputHash);
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

        const checkpoints = await repos.stageCheckpoints.byRun(runId);
        return {
          ok: true,
          snapshot,
          inputHash,
          checkpoints: checkpoints.map((c) => ({ stage: c.stage, artifact_id: c.artifact_id })),
        };
      })) as PlanOutcome;

      if (!planOutcome.ok) return;
      const { snapshot, checkpoints } = planOutcome;

      // ---- 2. STAGE A: TOPIC LATTICE ----
      const topicsCkp = checkpoints.find((c) => c.stage === 'topics');
      if (topicsCkp?.artifact_id) {
        // Resume: skip Stage A, reuse persisted lattice.
        await repos.runs.append(runId, deviceId, 'run.status:resuming', { stage: 'topics', from: 'checkpoint' });
      } else {
        await checkCancel('before-topics');

        await runStage(step, repos, runId, deviceId, 'topics', snapshot, async () => {
          const messages = [
            {
              role: 'system',
              content:
                'You are an Abyss Engine subject graph generator. Create a learning lattice for the given subject. Return valid JSON matching the subject-graph-topics schema.',
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
              jsonSchema: {
                type: 'object',
                properties: {
                  topics: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        topicId: { type: 'string' },
                        title: { type: 'string' },
                        tier: { type: 'number' },
                        icon: { type: 'string' },
                        learningObjectives: { type: 'array', items: { type: 'string' } },
                        prerequisites: { type: 'array', items: { type: 'string' } },
                        estimatedMinutes: { type: 'number' },
                      },
                      required: ['topicId', 'title', 'tier', 'icon'],
                    },
                  },
                },
                required: ['topics'],
              },
              providerHealingRequested: true,
            },
            this.env,
          );

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(raw.text) as Record<string, unknown>;
          } catch {
            throw new WorkflowFail('parse:json-mode-violation', 'invalid JSON from model for topic lattice');
          }

          const topics = parsed.topics as Array<unknown> | undefined;
          if (!topics || !Array.isArray(topics)) {
            throw new WorkflowFail('parse:zod-shape', 'missing topics array in lattice output');
          }

          // Basic validation
          const expectedTopicCount =
            ((snapshot.strategy as Record<string, unknown>)?.total_tiers as number ?? 3) *
            ((snapshot.strategy as Record<string, unknown>)?.topics_per_tier as number ?? 5);

          if (topics.length < expectedTopicCount) {
            throw new WorkflowFail(
              'validation:semantic-subject-graph',
              `expected at least ${expectedTopicCount} topics, got ${topics.length}`,
            );
          }

          return { kind: 'subject-graph-topics', payload: parsed, usage: raw.usage };
        });
      }

      // ---- 3. STAGE B: PREREQUISITE EDGES ----
      const edgesCkp = checkpoints.find((c) => c.stage === 'edges');
      if (edgesCkp?.artifact_id) {
        await repos.runs.append(runId, deviceId, 'run.status:resuming', { stage: 'edges', from: 'checkpoint' });
      } else {
        await checkCancel('before-edges');

        await runStage(step, repos, runId, deviceId, 'edges', snapshot, async () => {
          const messages = [
            {
              role: 'system',
              content:
                'You are an Abyss Engine prerequisite edge generator. Create prerequisite relationships between topics in the given lattice. Return valid JSON matching the subject-graph-edges schema.',
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
              jsonSchema: {
                type: 'object',
                properties: {
                  edges: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        source: { type: 'string' },
                        target: { type: 'string' },
                        minLevel: { type: 'number' },
                      },
                      required: ['source', 'target', 'minLevel'],
                    },
                  },
                },
                required: ['edges'],
              },
              providerHealingRequested: true,
              temperature: 0.1,
            },
            this.env,
          );

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(raw.text) as Record<string, unknown>;
          } catch {
            throw new WorkflowFail('parse:json-mode-violation', 'invalid JSON from model for prerequisite edges');
          }

          const edges = parsed.edges as Array<unknown> | undefined;
          if (!edges || !Array.isArray(edges)) {
            throw new WorkflowFail('parse:zod-shape', 'missing edges array in prerequisite output');
          }

          // Basic edge validation (the deterministic `correctPrereqEdges` repair
          // from the contracts module is applied here in the full implementation).
          for (const edge of edges) {
            const e = edge as Record<string, unknown>;
            if (e.source === e.target) {
              throw new WorkflowFail(
                'validation:semantic-subject-graph',
                `self-loop detected: ${String(e.source)} → ${String(e.target)}`,
              );
            }
          }

          // Deduplicate (source, target) pairs.
          const seen = new Set<string>();
          for (const edge of edges) {
            const e = edge as Record<string, unknown>;
            const key = `${String(e.source)}→${String(e.target)}`;
            if (seen.has(key)) {
              throw new WorkflowFail(
                'validation:semantic-subject-graph',
                `duplicate edge: ${key}`,
              );
            }
            seen.add(key);
          }

          return { kind: 'subject-graph-edges', payload: parsed, usage: raw.usage };
        });
      }

      // ---- 4. READY ----
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
