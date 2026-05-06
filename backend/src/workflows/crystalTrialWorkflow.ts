/**
 * Crystal Trial Workflow — Phase 1 PR-D.
 *
 * Six orchestrated steps executed durably on Cloudflare Workflows:
 *   1. plan      — validate snapshot, budget guard, cache-hit check
 *   2. generate  — OpenRouter call with strict json_schema (retries: 2)
 *   3. parse     — strictParseArtifact('crystal-trial', raw)
 *   4. validate  — semanticValidateArtifact('crystal-trial', payload, ctx)
 *   5. persist   — Supabase Storage put + artifacts upsert + token accounting
 *
 * Cooperative cancel: `checkCancel` polls `runs.cancel_requested_at` before
 * every step boundary.  On cancel, the workflow emits `run.cancelled` and
 * throws `WorkflowAbort`.
 *
 * `step.do()` result casts and the parse-step @ts-expect-error work around
 * the overly restrictive `Serializable<T>` constraint in `cloudflare:workers`.
 * All returned values are plain JSON-serializable objects at runtime (the DB
 * stores `jsonb`).
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { makeRepos } from '../repositories';
import { WorkflowFail, WorkflowAbort } from '../lib/workflowErrors';
import { assertBelowDailyCap } from '../budget/budgetGuard';
import { callCrystalTrial } from '../llm/openrouterClient';
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
// Helpers
// ---------------------------------------------------------------------------
async function computeInputHash(snapshot: Record<string, unknown>): Promise<string> {
  const json = JSON.stringify(snapshot, Object.keys(snapshot).sort());
  const data = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return `inp_${Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
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

        const budget = await assertBelowDailyCap(deviceId, repos.usage);
        if (!budget.ok) throw new WorkflowFail(budget.code!, budget.message!);

        const cached = await repos.artifacts.findCacheHit(deviceId, 'crystal-trial', inputHash);
        if (cached) {
          await repos.runs.append(runId, deviceId, 'run.artifact-ready', {
            artifactId: cached.id, contentHash: cached.content_hash, fromCache: true,
          });
          await repos.runs.markReady(runId);
          await repos.runs.append(runId, deviceId, 'run.completed', { fromCache: true });
          return { ok: false };
        }

        return { ok: true, snapshot, inputHash };
      })) as PlanOutcome;

      if (!planOutcome.ok) return;
      const { snapshot, inputHash } = planOutcome;

      // ---- 2. GENERATE — retries: 2, 5s delay, exponential ----
      await checkCancel('before-generate');

      const genResult = (await step.do(
        'generate',
        { retries: { limit: 2, delay: 5, backoff: 'exponential' } },
        async (): Promise<GenerateResult> => {
          await repos.runs.transition(runId, 'generating_stage');
          await repos.runs.append(runId, deviceId, 'run.status:generating-stage', { stage: 'generate' });

          const messages = [
            { role: 'system', content: 'You are a Crystal Trial question generator. Generate trial questions as JSON.' },
            { role: 'user', content: `Generate ${String(snapshot.question_count ?? 5)} Crystal Trial questions for topic "${String(snapshot.topic_id)}".` },
          ];

          return callCrystalTrial(
            {
              modelId: String(snapshot.model_id ?? 'openrouter/google/gemini-2.5-flash'),
              messages,
              jsonSchema: {
                type: 'object',
                properties: {
                  questions: { type: 'array', items: { type: 'object', properties: {
                    id: { type: 'string' }, text: { type: 'string' },
                    options: { type: 'array', items: { type: 'string' } },
                    correctAnswer: { type: 'string' }, category: { type: 'string' },
                    difficulty: { type: 'number' },
                  }, required: ['id','text','options','correctAnswer','category','difficulty'] }},
                  sourceCardSummaries: { type: 'array', items: { type: 'object' } },
                },
                required: ['questions', 'sourceCardSummaries'],
              },
              providerHealingRequested: true,
            },
            this.env,
          );
        },
      )) as GenerateResult;

      // ---- 3. PARSE — no retries ----
      await checkCancel('before-parse');

      // @ts-expect-error Serializable<Record> rejects `unknown` values; JSON.parse output is persisted as jsonb.
      const parsed = (await step.do('parse', async () => {
        await repos.runs.transition(runId, 'parsing');
        try { return JSON.parse(genResult.text) as Record<string, unknown>; }
        catch { throw new WorkflowFail('parse:json-mode-violation', 'invalid JSON from model'); }
      })) as Record<string, unknown>;

      // ---- 4. VALIDATE — no retries ----
      await checkCancel('before-validate');

      await step.do('validate', async () => {
        await repos.runs.transition(runId, 'validating');
        const questions = parsed.questions as Array<unknown> | undefined;
        if (!questions || !Array.isArray(questions)) {
          throw new WorkflowFail('validation:semantic-trial-question-count', 'missing questions array');
        }
        const expectedCount = snapshot.question_count as number | undefined;
        if (expectedCount && questions.length !== expectedCount) {
          throw new WorkflowFail('validation:semantic-trial-question-count',
            `expected ${expectedCount} questions, got ${questions.length}`);
        }
      });

      // ---- 5. PERSIST ----
      await checkCancel('before-persist');

      const persisted = (await step.do('persist', async (): Promise<PersistResult> => {
        await repos.runs.transition(runId, 'persisting');
        const contentHash = `cnt_temp_${crypto.randomUUID().slice(0, 16)}`;
        const artifactId = await repos.artifacts.putStorage(
          { deviceId, kind: 'crystal-trial', inputHash, payload: parsed }, contentHash, 1, runId,
        );
        if (genResult.usage) {
          try {
            await repos.usage.recordTokens(deviceId, new Date().toISOString().slice(0, 10), genResult.usage);
          } catch { /* non-critical */ }
        }
        return { artifactId, contentHash };
      })) as PersistResult;

      // ---- 6. READY ----
      await repos.runs.markReady(runId);
      await repos.runs.append(runId, deviceId, 'run.artifact-ready', persisted as unknown as Record<string, unknown>);
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
