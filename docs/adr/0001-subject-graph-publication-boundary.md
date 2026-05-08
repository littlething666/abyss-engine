# Subject Graph Generation Publishes Only Complete Subjects

Status: accepted and implemented

Subject Graph Generation creates generated Subjects, but the Learning Content Store must not expose a new or replacement Subject until both Topic Lattice generation and Prerequisite Edge wiring have completed and the backend has published a complete Subject Graph. We choose final publication over Stage A partial materialization because the backend is the source of truth for generated content and client reads/sync must never observe a partial curriculum graph.

## Implementation Notes

Implemented on 2026-05-08 in the backend durable workflow and Learning Content Store publication path:

- `SubjectGraphWorkflow` persists Stage A Topic Lattice artifacts/checkpoints only; it no longer applies `subject-graph-topics` to the Learning Content Store.
- A Stage A artifact cache hit emits/records artifact readiness idempotently and continues into Stage B instead of marking the run completed.
- Stage B generation uses an input hash that includes the Stage A lattice content hash.
- `publishCompleteSubjectGraphToLearningContent()` is the only subject-graph publication path. It assembles the complete Subject Graph from Stage A topics and Stage B edges, derives generated Subject metadata from the accepted snapshot and final graph, and publishes the Subject, Subject Graph, and unavailable topic-detail stubs through one repository publication method.
- Workflow terminal error handling preserves structured `WorkflowFail` codes across serialized Workflow step boundaries; non-LLM workflow failures no longer collapse into `llm:upstream-5xx`.

## Consequences

- Stage A Topic Lattice artifacts are durable workflow artifacts/checkpoints, not client-visible Learning Content.
- A Stage A cache hit may resume generation, but must not complete a subject-graph run by itself.
- Regenerating an existing subject must keep the old complete graph visible until the replacement graph publish step succeeds.
- Device-scoped Learning Content remains isolated by `device_id`; future auth migration will tighten the same ownership boundary to user identity.
