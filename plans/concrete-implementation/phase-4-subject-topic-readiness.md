# Phase 4 — Subject Topic Readiness Implementation Plan

## Current Status (2026-05-08)

Implemented.

Completed work:

- Backend Learning Content Store exposes `GET /v1/subjects/:subjectId/topics/statuses` as the subject-level Topic Content Status read.
- `/topics/:topicId/cards` now returns `200 { cards: [] }` for known topics with no cards and reserves `404` for unknown topic details.
- Subject Graph publication continues to create `unavailable` Topic Details stubs.
- Theory application preserves non-ready status; `topic-study-cards` application marks Topic Content Status `ready`; mini-game and expansion artifacts do not upgrade unavailable topics.
- Topic Content Workflow marks active study-producing pipelines `generating` and clears stale `generating` to `unavailable` or `ready` on terminal failure/cancel.
- Frontend repository contracts now include `getTopicContentStatuses(subjectId)` with strict backend status validation and local IndexedDB readiness derivation.
- Frontend query orchestration reads status once per subject and gates card queries behind `ready` in Scene, Attunement Ritual, topic card query helpers, and Study Panel model.
- PubSub invalidates `['content', 'topic-statuses', subjectId]` for topic updates, card updates, and Subject Graph publication.

Follow-ups suggested:

- Add dedicated workflow unit coverage for terminal failure/cancel stale-`generating` cleanup if durable workflow harness coverage is expanded.
- Remove deprecated per-topic `topic-ready` invalidation and compatibility exports after all downstream tests/consumers have migrated.
- Consider surfacing backend Topic Content Status timestamps in UI diagnostics once product copy for generation freshness is defined.

## Goal

After **Subject Graph Generation** publishes a complete **Published Subject**, the frontend must not eagerly request `/cards` for every topic. A Published Subject means the **Subject Graph** is visible; it does **not** mean **Topic Content** exists.

The fix is to make **Topic Content Status** the readiness interface and gate card reads behind that status.

## Decisions

1. **Published Subject** includes a complete Subject Graph and stub Topic Details rows.
2. **Topic Content** begins as `unavailable` for every newly published topic.
3. `ready` means study-ready: generated theory exists and at least one difficulty-1 study card is persisted.
4. `generating` means a Topic Content Pipeline is actively producing content for that topic.
5. `GET /cards` is a collection read: a known topic with zero cards returns `200 { cards: [] }`, not `404`.
6. `404` is reserved for unknown subject/topic/device-scope rows.
7. The frontend does not infer readiness by probing cards. It reads Topic Content Status first.

## Non-goals

- No data migrations or backward compatibility paths. The app is unreleased.
- No downstream `404` swallowing in the frontend repository adapter.
- No fake placeholder card rows.
- No defensive fallback parser or probabilistic recovery.

---

# PR 1 — Backend Learning Content status contract

## Files

```txt
backend/src/learningContent/types.ts
backend/src/learningContent/learningContentRepo.ts
backend/src/routes/learningContent.ts
backend/src/routes/learningContent.test.ts
```

## 1.1 Add a subject-level Topic Content Status read

Extend the backend Learning Content Store interface:

```ts
interface TopicContentStatusRow {
  subjectId: string;
  topicId: string;
  status: TopicContentStatus;
  updatedAt: string;
}

interface ILearningContentRepo {
  getTopicContentStatuses(deviceId: string, subjectId: string): Promise<TopicContentStatusRow[]>;
}
```

D1 query:

```sql
select subject_id, topic_id, status, updated_at
from topic_contents
where device_id = ? and subject_id = ?
order by topic_id asc
```

Route:

```txt
GET /v1/subjects/:subjectId/topics/statuses
```

Response:

```json
{
  "topics": [
    { "subjectId": "dft-fft", "topicId": "dft-basics", "status": "unavailable", "updatedAt": "..." }
  ]
}
```

If the subject graph does not exist for the device/subject, return `404`.

## 1.2 Change `/cards` empty-collection semantics

Current behavior:

```ts
if (cards.length === 0) return 404;
```

Replace with:

1. Check topic existence via `getTopicDetails(deviceId, subjectId, topicId)`.
2. If missing, return `404`.
3. Otherwise return `200 { cards }`, including `cards: []`.

This keeps explicit failure for unknown topics while making “known topic, no cards yet” a valid empty collection.

## Tests

Update `backend/src/routes/learningContent.test.ts`:

- `GET /topics/:topicId/cards` returns `200 { cards: [] }` for a known topic with no cards.
- `GET /topics/:topicId/cards` returns `404` for an unknown topic.
- `GET /topics/statuses` returns all topic statuses for the subject.
- `GET /topics/statuses` is device-scoped.
- `GET /topics/statuses` returns `404` when the subject graph is missing.

---

# PR 2 — Backend status transitions

## Files

```txt
backend/src/learningContent/artifactApplication.ts
backend/src/workflows/topicContentWorkflow.ts
backend/src/routes/runs.ts
backend/src/learningContent/artifactApplication.test.ts
backend/src/workflows/topicContentWorkflow.ts tests as needed
```

## 2.1 Define status transition rules

| Event | Status |
|---|---|
| Subject Graph published | `unavailable` |
| Topic Content Pipeline starts | `generating` |
| Theory artifact applied | preserve current status; never mark `ready` from theory alone |
| Study-card artifact applied | `ready` after cards persist |
| Mini-game / expansion artifact applied | preserve existing `ready`; do not make an unavailable topic ready by itself |
| Topic Content Pipeline fails/cancels before study-ready | `unavailable` |

## 2.2 Stop marking theory-only content as ready

In `applyTopicTheory()`, replace:

```ts
status: 'ready'
```

with status preservation:

```ts
status: existing?.status === 'generating' ? 'generating' : 'unavailable'
```

If the snapshot is an explicitly theory-only run, it should remain `unavailable` after terminal completion because the topic is not study-ready.

## 2.3 Mark study cards as ready

After `applyTopicCards()` persists a `topic-study-cards` artifact:

1. Load the existing Topic Details row.
2. Preserve its `details` JSON.
3. Write the same details with `status: 'ready'`.

Do this only for `topic-study-cards`. Expansion and mini-game artifacts should not upgrade a topic that lacks initial study cards.

## 2.4 Mark active full pipelines as generating

At Topic Content Workflow start, after the run snapshot has been loaded and before the first generation stage starts:

1. Load existing topic details.
2. If present and not already `ready`, write it back with `status: 'generating'`.

On workflow failure or cancellation, recompute:

- If details have non-empty theory and cards include a difficulty-1 card, keep/write `ready`.
- Otherwise write `unavailable`.

This prevents stale `generating` after failures.

## 2.5 Cache-hit path

`backend/src/routes/runs.ts` directly applies cached artifacts for non-full topic-content runs. Ensure cached `topic-study-cards` application also marks Topic Content Status `ready` through the same `applyArtifactToLearningContent()` path.

## Tests

Add/update tests to prove:

- Subject Graph publication creates `unavailable` topic details stubs.
- Theory artifact application does not mark `ready`.
- Study-card artifact application marks `ready`.
- Mini-game/expansion application does not convert `unavailable` to `ready`.
- Workflow failure after theory clears stale `generating` back to `unavailable`.

---

# PR 3 — Frontend repository status seam

## Files

```txt
src/types/repository.ts
src/types/topicContent.ts              # optional; preferred home for shared status contracts
src/infrastructure/repositories/BackendDeckRepository.ts
src/infrastructure/repositories/BackendDeckRepository.test.ts
src/infrastructure/repositories/IndexedDbDeckRepository.ts
src/infrastructure/pubsub.ts
src/infrastructure/pubsub.test.ts
```

## 3.1 Add frontend repository method

Add a Learning Content Store read method:

```ts
export interface TopicContentStatusRecord {
  subjectId: string;
  topicId: string;
  status: TopicContentStatus;
  updatedAt?: string;
}

interface IDeckRepository {
  getTopicContentStatuses(subjectId: string): Promise<TopicContentStatusRecord[]>;
}
```

Prefer placing `TopicContentStatus` and `TopicContentStatusRecord` in `src/types/topicContent.ts`, then importing them from progression code. This avoids treating readiness as progression-only terminology.

## 3.2 BackendDeckRepository implementation

Fetch:

```txt
/v1/subjects/{subjectId}/topics/statuses
```

Validate the envelope strictly:

```json
{ "topics": [...] }
```

Throw on malformed status values. Do not infer or repair.

## 3.3 IndexedDbDeckRepository implementation

For legacy local reads:

1. Load the Subject Graph.
2. For each node, load topic details and topic cards from IndexedDB.
3. Return `ready` only when `topicStudyContentReady(details, cards)` is true.
4. Return `unavailable` otherwise.

This is the adapter for local storage only; the browser UI should still consume the same repository method.

## 3.4 PubSub invalidation

Add canonical query key:

```ts
['content', 'topic-statuses', subjectId]
```

Invalidate it on:

- `topic:updated`
- `topic-cards:updated`
- `subject-graph:published`

Remove or stop relying on the old per-topic `topic-ready` invalidation once consumers migrate.

---

# PR 4 — Frontend status-driven query orchestration

## Files

```txt
src/hooks/useTopicContentStatusMap.ts
src/hooks/useTopicContentStatusMap.test.tsx
src/hooks/useTopicCardQueries.ts
src/hooks/useDeckData.ts
src/components/Scene.tsx
src/components/AttunementRitualModal.tsx
src/components/TopicSelectionBar.tsx
src/hooks/useStudyPanelModel.ts
```

## 4.1 Replace readiness probing

Current `useTopicContentStatusMap()` runs one readiness query per topic and calls both details and cards.

Replace with:

1. Read all graphs with `useAllGraphs()`.
2. Group graph topics by `subjectId`.
3. Query `deckRepository.getTopicContentStatuses(subjectId)` once per subject.
4. Build a map keyed by `topicRefKey`.
5. For graph nodes missing from the response, assign `unavailable`.
6. Overlay active in-browser generation jobs as `generating`.

Do not call `getTopicCards()` in this hook.

## 4.2 Gate card queries behind readiness

Update `useTopicCardQueriesFromRefs()` to accept status input:

```ts
function useTopicCardQueriesFromRefs(
  topicRefs,
  allTopicMetadata,
  contentStatusByTopicKey,
)
```

Enable each query only when:

```ts
contentStatusByTopicKey[topicRefKey(ref)] === 'ready'
```

Callers:

- `Scene` passes `useTopicContentStatusMap()` into `useTopicCardQueriesForActiveTopics(...)`.
- `AttunementRitualModal` should use the same gated Module or only query the selected target crystal when ready.
- `useStudyPanelModel` should call `useTopicCards(...)` only when the selected topic status is `ready`.

## 4.3 Default unknown status to unavailable

In `TopicSelectionBar`, replace the current missing-status default:

```ts
return contentStatusMap[key] ?? 'ready';
```

with:

```ts
return contentStatusMap[key] ?? 'unavailable';
```

This prevents Play from appearing before readiness is known.

## 4.4 Preserve selected-card behavior

When a topic is not ready:

- `selectedTopicCards` should be `[]`.
- Begin Study should not start.
- The primary action should be Generate or Generating, not Play.

## Tests

Update/add tests proving:

- `useTopicContentStatusMap()` calls `getTopicContentStatuses`, not `getTopicCards`.
- Active content-generation jobs override repository `ready`/`unavailable` to `generating`.
- Missing status rows become `unavailable`.
- `useTopicCardQueriesForActiveTopics()` does not enable card queries for unavailable/generating topics.
- `TopicSelectionBar` defaults unknown status to `unavailable`.
- `useStudyPanelModel` does not request cards for unavailable topics.

---

# Verification checklist

Manual verification for the reported case:

1. Generate subject `dft-fft`.
2. After Subject Graph Generation completes, open Network tab.
3. Confirm frontend calls:
   - `/v1/library/manifest`
   - `/v1/subjects/dft-fft/graph`
   - `/v1/subjects/dft-fft/topics/statuses`
4. Confirm frontend does **not** call `/topics/{topicId}/cards` for unavailable topics.
5. Unlock or generate one topic.
6. During generation, status is `generating` in UI.
7. After study cards are persisted, status becomes `ready`.
8. Only then does the frontend request `/topics/{topicId}/cards`.
9. If `/cards` is called for a known topic with no cards, response is `200 { "cards": [] }`, not `404`.

Automated verification:

```txt
pnpm test -- backend/src/routes/learningContent.test.ts
pnpm test -- backend/src/learningContent/artifactApplication.test.ts
pnpm test -- src/hooks/useTopicContentStatusMap.test.tsx
pnpm test -- src/infrastructure/repositories/BackendDeckRepository.test.ts
pnpm test -- src/infrastructure/pubsub.test.ts
```

Adjust exact commands to existing package scripts if backend/frontend tests are split.

---

# Compliance, Risk & Drift Assessment

## Misalignment check

Current behavior conflates **Published Subject** with ready **Topic Content**. That contradicts the documented domain model: a Published Subject owns a Subject Graph; Topic Content is generated separately.

## Architectural risk

Medium risk because this touches the Learning Content Store seam, frontend repository interface, and query orchestration. Mitigation: make Topic Content Status a single explicit repository read and test behavior through that interface.

## Drift prevention

Do not solve this by catching `/cards` 404s in `BackendDeckRepository` or by adding empty placeholder cards. Those would normalize workaround behavior. The durable fix is status-driven gating plus correct collection endpoint semantics.
