## Context constraints

The implementation should stay inside the current Phase 4 architecture: **Cloudflare Workflows + Hono Worker + D1 + R2**, not Durable Objects as a replacement orchestrator. The plan explicitly says runtime proof is the remaining gap after semantic event idempotency, step-bound side effects, backend artifact materialization, and route-validation seams landed. 

The backend already has `@cloudflare/vitest-pool-workers` available and D1/R2/Workflow bindings in the backend package/env surface, so the next step is not more fake-D1 unit coverage; it is Worker-runtime integration coverage using the actual Cloudflare test pool. 

---

# 1. Add real Cloudflare runtime tests for replay / concurrency / idempotency

## Goal

Prove that the durability model works under the Cloudflare runtime, not only under `fakeD1`.

Must cover:

* D1 atomicity under concurrent submit.
* Semantic-keyed event replay/idempotency.
* R2 artifact write/read behavior.
* Workflow retry/replay behavior around `step.do`.
* Cancellation and supersession boundaries.
* Cache-hit materialization.
* Retry child-run lineage.
* Dispatch failure with no orphan queued run.

The plan already calls out exactly this gap: Cloudflare runtime tests should cover Workflow replay, duplicate event prevention, R2, D1 transaction semantics, cancellation, cache-hit materialization, retry child runs, dispatch failure, and real/local D1 `atomicSubmitRun`. 

---

## PR 1A — Runtime test harness

### Files to add

```txt
backend/
  vitest.runtime.config.ts
  src/runtimeTests/
    setupRuntimeDb.ts
    runtimeFixtures.ts
    runtimeAssertions.ts
    d1AtomicSubmit.runtime.test.ts
    eventIdempotency.runtime.test.ts
```

### Package script

Add:

```json
{
  "scripts": {
    "test:runtime": "vitest run --config vitest.runtime.config.ts"
  }
}
```

### Harness requirements

Use `@cloudflare/vitest-pool-workers` with:

* `isolatedStorage: true`
* Worker entrypoint: `src/index.ts`
* `wrangler.toml` bindings
* real local D1 binding: `GENERATION_DB`
* real local R2 binding: `GENERATION_ARTIFACTS_BUCKET`
* Workflow bindings where supported by the pool

Each test should reset and re-apply the canonical schema from:

```txt
backend/d1/reset.sql
backend/d1/init.sql
```

This matches the current unreleased-app posture: `backend/d1/init.sql` is the canonical schema and JSON columns are parsed/stringified only in repository adapters. 

---

## PR 1B — Real D1 `atomicSubmitRun` concurrency tests

### File

```txt
backend/src/runtimeTests/d1AtomicSubmit.runtime.test.ts
```

### Tests

#### 1. Same `Idempotency-Key` concurrent submit returns one run

Execute 8–20 concurrent `atomicSubmitRun` calls with identical:

```ts
{
  deviceId,
  idempotencyKey,
  kind: 'crystal-trial',
  inputHash,
  snapshotJson
}
```

Assert:

```sql
select count(*) from runs = 1
select count(*) from idempotency_records = 1
select runs_started from usage_counters = 1
```

Also assert every call returns the same `runId`.

#### 2. Idempotency hit does not reserve budget twice

Run once, then call again with the same idempotency key.

Assert:

* one `runs` row
* one `idempotency_records` row
* `usage_counters.runs_started = 1`

This directly proves the plan’s requirement: “idempotency hit does not reserve budget twice.” 

#### 3. Budget failure leaves no idempotency record

Seed `usage_counters.runs_started` at the cap for the pipeline kind.

Call `atomicSubmitRun`.

Assert:

```sql
select count(*) from runs = 0
select count(*) from idempotency_records = 0
```

#### 4. Run creation failure rolls back idempotency reservation

Force a D1 failure after idempotency reservation but before commit, for example with an invalid `parent_run_id` FK.

Assert:

```sql
select count(*) from runs = 0
select count(*) from idempotency_records = 0
select runs_started from usage_counters = unchanged
```

#### 5. Ready cache hit behaves consistently

Seed a ready artifact for `(device_id, kind, input_hash)`.

Submit the same intent/input hash.

Assert:

* route returns cache-hit semantics, or the existing contract’s equivalent
* no duplicate artifact row
* no token usage increment
* run-start accounting matches the intended budget rule

The D1 schema already has unique constraints for artifacts by `(device_id, kind, input_hash)`, so this test should verify actual D1 behavior, not mocked behavior. 

---

## PR 1C — Real D1 semantic event idempotency tests

### File

```txt
backend/src/runtimeTests/eventIdempotency.runtime.test.ts
```

### Tests

#### 1. Concurrent `appendTypedOnce` with same semantic key creates one event

Call:

```ts
Promise.all(
  Array.from({ length: 20 }, () =>
    repos.runs.appendTypedOnce(
      runId,
      deviceId,
      'terminal:completed',
      buildRunCompletedEvent()
    )
  )
)
```

Assert:

```sql
select count(*) from events where semantic_key = 'terminal:completed' = 1
```

Also assert all returned events have the same `seq`.

Current code uses `events.semantic_key`, a unique `(run_id, semantic_key)` constraint, and `appendOnce` / `appendTypedOnce` to return the existing semantic event on replay. 

#### 2. Distinct semantic keys remain ordered and unique

Append:

```txt
status:planning
stage:theory:generating
artifact:theory
terminal:completed
```

Assert:

* no duplicate `seq`
* events replay in ascending `seq`
* SSE `eventsAfter` returns only `seq > lastSeq`

#### 3. Runtime conflict path returns replayed row

Use concurrent inserts to force `on conflict(run_id, semantic_key) do nothing`.

Assert:

* no thrown error
* returned row is the original persisted event
* only one row exists

---

## PR 1D — Runtime Worker route tests for submit / dispatch failure / retry

### File

```txt
backend/src/runtimeTests/runsRoute.runtime.test.ts
```

### Tests

#### 1. `POST /v1/runs` rejects client snapshots and policy fields

Use the actual Worker `fetch`.

Assert malformed bodies fail before D1 writes.

This locks the already-landed boundary: `POST /v1/runs` accepts `{ kind, intent }`, rejects client-built `snapshot`, rejects policy fields at any depth, and expands intents server-side through the Learning Content Store plus backend Generation Policy. 

#### 2. Workflow dispatch failure leaves no orphan queued run

Configure a test Workflow binding that throws on `.create()`.

Submit a valid intent.

Assert:

```sql
runs.status != 'queued'
```

or no run row, depending on the intended contract.

Also assert a structured JSON error response.

#### 3. Retry child run preserves lineage

Seed a failed parent run.

Call:

```http
POST /v1/runs/:id/retry
```

Assert:

```sql
child.parent_run_id = parent.id
child.status = queued or ready/cache-hit
```

Also assert the response includes the child `{ runId }`.

---

## PR 1E — Workflow replay / R2 / Learning Content materialization tests

### Files

```txt
backend/src/runtimeTests/workflowReplay.runtime.test.ts
backend/src/runtimeTests/workflowFaults.ts
```

### Test strategy

Avoid real OpenRouter calls. Use Cloudflare runtime fetch mocking or a test-only env-controlled seam to return deterministic strict JSON Schema responses.

Add a narrowly scoped fault-injection seam, enabled only in tests:

```ts
maybeInjectWorkflowFault(env, 'after-r2-put-before-artifact-row')
maybeInjectWorkflowFault(env, 'after-artifact-row-before-lcs-apply')
maybeInjectWorkflowFault(env, 'after-lcs-apply-before-artifact-ready')
maybeInjectWorkflowFault(env, 'after-artifact-ready-before-run-completed')
```

The seam must be inert unless a runtime-test env var is set.

### Tests

#### 1. Replay after R2 write does not duplicate artifact metadata

Fault after `R2.put`, before artifact D1 row.

On replay, assert:

* one R2 object at the expected key
* one artifact metadata row
* one `artifact.ready` event

#### 2. Replay after artifact row does not duplicate Learning Content rows

Fault after artifact metadata write, before Learning Content application.

On replay, assert:

* one artifact row
* one topic/details/cards/trial read-model row set
* terminal `run.completed` exactly once

The current workflows already apply validated artifacts to the D1 Learning Content Store before completion and put side effects inside named `step.do` boundaries; this test proves that behavior in the runtime. 

#### 3. Replay after Learning Content application does not duplicate events

Fault after LCS write, before `artifact.ready`.

Assert:

```sql
select count(*) from events where type = 'artifact.ready' = 1
select count(*) from events where type = 'run.completed' = 1
```

#### 4. Cache-hit materialization completes before terminal event

Seed an existing artifact and empty Learning Content row.

Submit matching run.

Assert:

* LCS row exists before `run.completed`
* no OpenRouter call occurred
* one `artifact.ready` event with `fromCache: true`

#### 5. Cancellation boundaries

Cover:

* cancel before Workflow start: terminal `cancelled`, no LLM call
* cancel mid-stage: `cancel_acknowledged`, then terminal `cancelled` at boundary
* cancel after ready: no destructive state change; ready remains terminal

#### 6. Topic Expansion supersession under concurrency

Submit two topic-expansion runs with the same supersession key.

Assert:

* only the newest active run remains non-terminal
* superseded run becomes `cancelled`
* no user-facing failure event for supersession
* no D1 unique constraint leak

---

## Item 1 exit criteria

Mark item 1 complete only when:

* `pnpm --filter backend test` passes.
* `pnpm --filter backend test:runtime` passes.
* same-key submit concurrency creates exactly one run and one budget reservation.
* semantic-keyed events are duplicate-proof under concurrent calls.
* Workflow replay fault tests create no duplicate artifact rows, LCS rows, `artifact.ready`, or terminal events.
* cancellation, retry, dispatch-failure, and supersession behavior is proven under Cloudflare runtime, not only fake repositories.

---

# 2. Continue validation hardening for generation-policy config parsing and Learning Content Store JSON envelopes

## Goal

Move validation from “mostly type-shaped objects and JSON parse helpers” to explicit, reusable schemas at every backend config/read-model boundary.

Current generation-policy parsing is strict but hand-rolled: it checks plain objects, exact keys, version/provider, `responseHealing.enabled`, required job kinds, model IDs, and temperature range. 

Current Learning Content Store types still expose broad `JsonObject` envelopes for subject metadata, subject graphs, topic details, cards, and trial questions; repository rows store JSON as strings. 

---

## PR 2A — Replace hand-rolled generation-policy parsing with schema-backed parsing

### Files

```txt
backend/src/generationPolicy/generationPolicySchema.ts
backend/src/generationPolicy/parseGenerationPolicy.ts
backend/src/generationPolicy/generationPolicy.test.ts
```

### Implementation

Add a Zod schema:

```ts
const generationJobPolicySchema = z.object({
  modelId: z.string()
    .trim()
    .min(1)
    .max(256)
    .regex(/^openrouter\/[^\s/]+\/[^\s]+$/),
  temperature: z.number().finite().min(0).max(2).optional(),
}).strict();

const generationPolicySchema = z.object({
  version: z.literal(1),
  provider: z.literal('openrouter'),
  responseHealing: z.object({
    enabled: z.literal(true),
  }).strict(),
  jobs: z.object({
    'subject-graph-topics': generationJobPolicySchema,
    'subject-graph-edges': generationJobPolicySchema,
    'topic-theory': generationJobPolicySchema,
    'topic-study-cards': generationJobPolicySchema,
    'topic-mini-game-category-sort': generationJobPolicySchema,
    'topic-mini-game-sequence-build': generationJobPolicySchema,
    'topic-mini-game-match-pairs': generationJobPolicySchema,
    'topic-expansion-cards': generationJobPolicySchema,
    'crystal-trial': generationJobPolicySchema,
  }).strict(),
}).strict();
```

Keep the public function:

```ts
parseGenerationPolicy(input: unknown): GenerationPolicy
```

but implement it through `safeParse`.

On failure, throw:

```ts
new WorkflowFail(
  'config:invalid',
  `invalid backend generation policy: ${summarizedZodIssues}`
)
```

### Additional hardening

Add:

```ts
parseGenerationPolicyJson(raw: string, source: string): GenerationPolicy
```

Behavior:

* reject blank string
* reject invalid JSON
* reject JSON arrays/null
* reject unknown fields
* return normalized policy
* never silently fall back to default policy after invalid override

This prepares the backend for future operator-owned config without allowing browser settings back into policy ownership. The default policy already documents that browser settings never feed backend generation policy. 

### Tests

Add cases for:

* `NaN`, `Infinity`, string temperatures
* `modelId` with whitespace/control chars
* non-OpenRouter model IDs
* extra nested keys under a job
* extra nested keys under `responseHealing`
* missing one of the nine job kinds
* duplicate/unknown job key
* invalid JSON config string
* blank config string
* stable `generationPolicyHash` after normalized parse
* no partial/default fallback after invalid override

---

## PR 2B — Add Learning Content Store envelope schemas

### Files

```txt
backend/src/learningContent/envelopeSchemas.ts
backend/src/learningContent/envelopeValidation.ts
backend/src/learningContent/learningContentRepo.ts
backend/src/learningContent/learningContentRepo.validation.test.ts
```

### Schemas to add

#### Subject metadata envelope

Validate the existing required frontend manifest envelope:

```ts
metadata.subject.description
metadata.subject.color
metadata.subject.geometry.gridTile
metadata.subject.topicIds?
metadata.subject.metadata?
```

The current status already says `upsertSubject` rejects rows unless this manifest envelope exists, but it should be centralized and schema-backed rather than embedded ad hoc. 

#### Subject graph envelope

Validate at write and read:

```ts
{
  subjectId: string,
  title: string,
  nodes: Array<{
    topicId: string,
    title: string,
    iconName: string,
    tier: number,
    learningObjective?: string,
    prerequisites: Array<{ topicId: string, minLevel: number }>
  }>
}
```

Keep optional fields only where the frontend read model truly supports them.

#### Topic details envelope

Validate at write and read:

```ts
{
  topicId?: string,
  title?: string,
  theory?: unknown,
  coreConcepts?: unknown,
  ...
}
```

Use the actual frontend `BackendDeckRepository` transport expectations as the source of truth. Do not invent defaults in the backend.

#### Topic card envelope

Validate at write and read:

```ts
{
  id: string,
  ...
}
```

Plus repository-level invariants:

```ts
card.id === cardId
difficulty is integer in allowed range
sourceArtifactKind is a known ArtifactKind
```

Frontend already checks wrapper/card ID mismatch; backend should reject before persistence.

#### Crystal Trial questions envelope

Validate at write and read:

```ts
{
  questions: array
}
```

Where possible, reuse or mirror the contract-owned `crystal-trial` artifact schema after materialization.

---

## PR 2C — Validate JSON at both repository boundaries

### Write path

Before every `stringifyJson(...)` in `learningContentRepo.ts`, call:

```ts
validateSubjectMetadataEnvelope(input.metadata)
validateSubjectGraphEnvelope(input.graph)
validateTopicDetailsEnvelope(input.details)
validateTopicCardEnvelope(card.card, card.cardId)
validateCrystalTrialQuestionsEnvelope(input.questions)
```

Current repository methods stringify these JSON envelopes into D1 columns such as `metadata_json`, `graph_json`, `details_json`, `card_json`, and `questions_json`. 

### Read path

After every `parseJsonObject(...)`, validate again.

This catches DB corruption, stale rows, or old local data created before the stricter materializer.

Use fail-loud behavior:

```ts
throw new WorkflowFail(
  'validation:lcs-envelope',
  `invalid Learning Content Store ${columnName}: ${issueSummary}`
)
```

If `validation:lcs-envelope` is not already part of the shared failure-code registry, add it there with tests. Otherwise use the closest existing `validation:*` code and document the mapping.

---

## PR 2D — Route-level hardening for corrupted Learning Content rows

### Files

```txt
backend/src/routes/learningContent.test.ts
backend/src/routes/learningContent.ts
```

### Tests

Seed malformed D1 rows directly, bypassing the repository write validators.

Assert read routes fail with structured backend error, not silent fallback:

```http
GET /v1/library/manifest
GET /v1/subjects/:subjectId/graph
GET /v1/subjects/:subjectId/topics/:topicId/details
GET /v1/subjects/:subjectId/topics/:topicId/cards
GET /v1/subjects/:subjectId/topics/:topicId/trials/:targetLevel?cardPoolHash=...
```

Expected behavior:

* no frontend-compatible fake/default object
* no partial malformed payload
* structured error with validation code
* 500 or 422, depending on existing route error policy; choose one and lock it

The current Learning Content routes already cover device-scoped lookup, malformed route inputs, and missing rows; this adds malformed persisted envelope coverage. 

---

## PR 2E — Artifact applier validation lockstep

### Files

```txt
backend/src/learningContent/artifactApplication.test.ts
backend/src/learningContent/artifactApplication.ts
```

### Tests

For each artifact kind currently materialized:

* `subject-graph-topics`
* `subject-graph-edges`
* `topic-theory`
* `topic-study-cards`
* `topic-expansion-cards`
* `topic-mini-game-category-sort`
* `topic-mini-game-sequence-build`
* `topic-mini-game-match-pairs`
* `crystal-trial`

Assert the applier produces only envelopes accepted by the new Learning Content Store schemas.

The current applier already materializes subject graph topics/edges, topic details/cards, and trial sets; this PR makes those materialization outputs schema-locked. 

---

## Item 2 exit criteria

Mark item 2 complete only when:

* `parseGenerationPolicy` is schema-backed and still throws `WorkflowFail('config:invalid')`.
* invalid operator JSON never falls back to default policy.
* all nine backend job kinds are required exactly once.
* every LCS JSON write validates before D1 persistence.
* every LCS JSON read validates after D1 parse.
* corrupted persisted LCS rows fail loudly through routes.
* artifact appliers are proven to emit schema-valid read-model envelopes.
* no backend path relies on frontend defaults for missing `description`, `color`, `geometry.gridTile`, card IDs, graph nodes, or trial question wrappers.

---

# Recommended execution order

1. **PR 1A–1C first:** runtime harness + real D1 idempotency/event tests. These are low-LLM-risk and directly prove the database primitives.
2. **PR 2A–2C next:** policy parser and LCS envelope schemas. This improves failure locality before deeper Workflow tests.
3. **PR 1D–1E next:** Worker route and Workflow replay tests, including R2 and LCS materialization.
4. **PR 2D–2E last:** route-level corrupted-row behavior and artifact-applier lockstep.
5. Update `plans/phase4-temporary-recommended-next-steps.md` after each PR: move completed bullets out of “remaining follow-ups,” and keep any runtime-specific Cloudflare caveats explicit.
