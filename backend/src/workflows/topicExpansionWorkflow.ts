/**
 * Topic Expansion Workflow — Phase 2 PR-2B.
 *
 * Single-stage durable pipeline: generate → parse → validate → persist.
 * Mirrors `runExpansionJob.ts` but runs server-side on Cloudflare Workflows
 * with strict json_schema and cooperative cancel.
 *
 * Supersession: a newer level-up cancels in-flight expansion with
 * `cancel_reason='superseded'`. The composition root suppresses the
 * player-facing failure copy for superseded runs.
 *
 * Retries: generate step has 2 retries (5s delay, exponential backoff).
 * Parse and validate steps carry no automatic retries — failures are terminal.
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { makeRepos } from '../repositories';
import { WorkflowFail, WorkflowAbort } from '../lib/workflowErrors';
import { assertBelowDailyCap } from '../budget/budgetGuard';
import { callTopicExpansion } from '../llm/openrouterClient';
import type { Env } from '../env';

// ---------------------------------------------------------------------------
// Step return shapes (all JSON-serializable at runtime)
// ---------------------------------------------------------------------------
interface PlanOutcomeOk {
  ok: true;
  snapshot: Record<string, unknown>;
  inputHash: string;
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

        const budget = await assertBelowDailyCap(deviceId, repos.usage, 'topic-expansion');
        if (!budget.ok) throw new WorkflowFail(budget.code!, budget.message!);

        const cached = await repos.artifacts.findCacheHit(deviceId, 'topic-expansion-cards', inputHash);
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
            {
              role: 'system',
              content:
                'You are an Abyss Engine topic-expansion card generator. Generate new study cards at the requested difficulty level that complement the existing card pool. Return valid JSON matching the topic-expansion-cards schema.',
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
        try {
          return JSON.parse(genResult.text) as Record<string, unknown>;
        } catch {
          throw new WorkflowFail('parse:json-mode-violation', 'invalid JSON from model');
        }
      })) as Record<string, unknown>;

      // ---- 4. VALIDATE — no retries ----
      await checkCancel('before-validate');

      await step.do('validate', async () => {
        await repos.runs.transition(runId, 'validating');

        const cards = parsed.cards as Array<unknown> | undefined;
        if (!cards || !Array.isArray(cards)) {
          throw new WorkflowFail('parse:zod-shape', 'missing cards array in expansion output');
        }

        // Check that all cards have a difficulty value.
        const expectedDifficulty = (snapshot.difficulty as number) ?? ((snapshot.next_level as number) ?? 1) + 1;
        for (const card of cards) {
          const c = card as Record<string, unknown>;
          if (typeof c.id !== 'string' || c.id.trim() === '') {
            throw new WorkflowFail('validation:semantic-card-content-shape', 'card missing id');
          }
          if (typeof c.cardType !== 'string') {
            throw new WorkflowFail('validation:semantic-card-content-shape', 'card missing cardType');
          }
          if (typeof c.difficulty !== 'number') {
            throw new WorkflowFail('validation:semantic-card-content-shape', 'card missing difficulty');
          }
          if (typeof c.conceptStem !== 'string' || c.conceptStem.trim() === '') {
            throw new WorkflowFail('validation:semantic-card-content-shape', 'card missing conceptStem');
          }
        }

        // Check for duplicate concept stems (case-insensitive).
        const stems = new Set<string>();
        for (const card of cards) {
          const stem = String((card as Record<string, unknown>).conceptStem).toLowerCase().trim();
          if (stems.has(stem)) {
            throw new WorkflowFail(
              'validation:semantic-duplicate-concept',
              `duplicate concept stem: "${String((card as Record<string, unknown>).conceptStem)}"`,
            );
          }
          stems.add(stem);
        }

        // Check pool size minimum (Phase 0 step 9 drift floor).
        if (cards.length < 3) {
          throw new WorkflowFail(
            'validation:semantic-card-pool-size',
            `expansion generated only ${cards.length} cards (minimum 3)`,
          );
        }
      });

      // ---- 5. PERSIST ----
      await checkCancel('before-persist');

      const persisted = (await step.do('persist', async (): Promise<PersistResult> => {
        await repos.runs.transition(runId, 'persisting');
        const contentHash = `cnt_${crypto.randomUUID().slice(0, 16)}`;

        const artifactId = await repos.artifacts.putStorage(
          { deviceId, kind: 'topic-expansion-cards', inputHash, payload: parsed },
          contentHash,
          (snapshot.schema_version as number) ?? 1,
          runId,
        );

        if (genResult.usage) {
          try {
            await repos.usage.recordTokens(
              deviceId,
              new Date().toISOString().slice(0, 10),
              genResult.usage,
            );
          } catch { /* non-critical */ }
        }

        return { artifactId, contentHash };
      })) as PersistResult;

      // ---- 6. READY ----
      await repos.runs.markReady(runId);
      await repos.runs.append(runId, deviceId, 'run.artifact-ready', {
        artifactId: persisted.artifactId,
        contentHash: persisted.contentHash,
        kind: 'topic-expansion-cards',
      });
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
