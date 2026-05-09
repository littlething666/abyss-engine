# ADR 0003: Backend-Authoritative Generation and Learning Content

Status: accepted
Date: 2026-05-09

## Context

The generation system originally included browser-owned execution paths: frontend snapshot construction, local in-tab runners, browser model/provider settings, response-healing settings, a frontend generation HUD/log store, local artifact application, and generated question/content persistence in browser storage.

Phase 4 moves generation to durable-only routing and makes the backend responsible for execution, generation policy, snapshot expansion, prompt construction, validation, persistence, and generated Learning Content publication.

## Decision

Generation is backend-authoritative.

The browser submits compact generation intents and observes durable run events. The backend expands intents into canonical `RunInputSnapshot`s, resolves generation policy, builds prompts, calls the LLM, validates outputs, persists artifacts, materializes Learning Content, and emits durable run events.

The browser must not:

- construct canonical generation execution snapshots for runtime submission;
- choose generation pipeline models;
- toggle provider response healing for generation pipelines;
- run generation pipelines in-tab;
- maintain a generation HUD/log state as a second source of truth;
- apply durable generation artifacts into browser IndexedDB/Zustand as the generated-content source of truth;
- abort durable generation on navigation.

## Accepted Rules

1. `POST /v1/runs` accepts `{ kind, intent }` only.
2. The Worker rejects client-supplied snapshots and generation-policy fields, including model, provider, response-healing, plugins, and response-format fields.
3. Backend `GenerationPolicy` is the only source of generation pipeline model choice and provider response-healing posture.
4. Response healing is not user-toggleable for generation pipelines. v1 keeps OpenRouter `response-healing` enabled by backend policy and records `providerHealingRequested` in run/job metadata.
5. Subject Graph topic-stage intents carry checklist-only browser input. The backend derives the canonical strategy brief before snapshot hashing.
6. The Learning Content Store is the product read model for generated Subjects, Subject Graphs, Topic Content, study cards, and Crystal Trial question sets.
7. Durable workflows write validated artifacts into the Learning Content Store before `run.completed` is emitted.
8. Durable run observation in the browser is a content-refresh and product-notification consumer: it may invalidate/refetch backend reads and emit compatibility notifications, but it must not fetch artifacts and locally apply them as source-of-truth writes.
9. Crystal Trial generated questions are read through backend current-set routes. Browser state owns only player attempt, answer, cooldown, score, and progression state.
10. Destructive reset is allowed before release: old browser IndexedDB/localStorage generation data, local runners, frontend generation logs, frontend artifact appliers, and pipeline settings do not require migration.

## Consequences

- Runtime frontend submission types are intent-only.
- Runtime frontend imports of snapshot builders and `inputHash` are forbidden outside shared contract/test seams.
- Local in-tab generation runners and local generation adapters are deleted.
- `NEXT_PUBLIC_DURABLE_RUNS*` routing flags are deleted; durable routing is unconditional when the Worker URL is configured.
- Pipeline model/provider/healing settings are removed from browser settings. Study-explanation settings may remain separate.
- Browser generated-content storage is not authoritative. Backend Learning Content Store reads drive UI readiness and content rendering.
- Failure diagnostics and retry belong to backend run/debug surfaces or explicit future backend-run consumers, not a frontend generation HUD.

## Open Follow-up

The remaining cleanup is mechanical, not architectural: delete or quarantine any leftover frontend-only prompt/parser modules and add final boundary guards to prevent reintroducing local workflow seams.

## Related

- [ADR 0001: Subject Graph Generation Publishes Only Complete Subjects](./0001-subject-graph-publication-boundary.md)
- [ADR 0002: Durable Generation Infrastructure](./0002-durable-generation-infrastructure.md)
