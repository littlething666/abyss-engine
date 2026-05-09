# ADR 0001: Subject Graph Generation Publishes Only Complete Subjects

Status: accepted and implemented
Date: 2026-05-08

## Context

Subject Graph Generation creates generated Subjects through a staged backend workflow:

1. Stage A generates the Topic Lattice.
2. Stage B wires Prerequisite Edges.
3. The backend publishes generated Learning Content.

The Learning Content Store is the product read model for generated Subjects and Subject Graphs. Client reads and sync must not observe a partial curriculum graph, and regeneration must not hide a previously valid graph until a complete replacement is ready.

ADR 0003 makes backend generation authoritative.

## Decision

Subject Graph Generation publishes only a complete Subject Graph.

The Topic Lattice stage may persist durable artifacts and checkpoints, but it must not publish a client-visible Subject or partial Subject Graph. Learning Content Store reads expose a new or replacement generated Subject only after prerequisite-edge wiring has completed and the backend has published the complete Subject, Subject Graph, and unavailable topic-detail stubs in one publication path.

`publishCompleteSubjectGraphToLearningContent()` is the only Subject Graph Learning Content publication path.

## Consequences

- Stage A Topic Lattice artifacts are durable workflow artifacts/checkpoints, not client-visible Learning Content.
- A Stage A cache hit may resume generation, but it must not complete a subject-graph run by itself.
- Stage B generation is required before run completion and final Learning Content publication.
- Regenerating an existing subject keeps the previously published graph visible until the replacement graph publish step succeeds.
- Device-scoped Learning Content remains isolated by `device_id`; future auth migration tightens the same ownership boundary to user identity.
- This ADR remains valid only as a backend publication-boundary decision. Any broader generation-ownership rule belongs in ADR 0003.

## Implementation Notes

Implemented on 2026-05-08 in the backend durable workflow and Learning Content Store publication path:

- `SubjectGraphWorkflow` persists Stage A Topic Lattice artifacts/checkpoints only; it no longer applies `subject-graph-topics` to the Learning Content Store.
- A Stage A artifact cache hit emits/records artifact readiness idempotently and continues into Stage B instead of marking the run completed.
- Stage B generation uses an input hash that includes the Stage A lattice content hash.
- The complete publication step assembles the final Subject Graph from Stage A topics and Stage B edges, derives generated Subject metadata from the accepted snapshot and final graph, and publishes the Subject, Subject Graph, and unavailable topic-detail stubs through one repository publication method.
- Workflow terminal error handling preserves structured `WorkflowFail` codes across serialized Workflow step boundaries; non-LLM workflow failures no longer collapse into `llm:upstream-5xx`.

## Related

- [ADR 0002: Durable Generation Infrastructure](./0002-durable-generation-infrastructure.md)
- [ADR 0003: Backend-Authoritative Generation and Learning Content](./0003-backend-authoritative-generation.md)
