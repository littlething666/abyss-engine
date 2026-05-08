# Subject Graph Generation Publishes Only Complete Subjects

Status: accepted

Subject Graph Generation creates generated Subjects, but the Learning Content Store must not expose a new or replacement Subject until both Topic Lattice generation and Prerequisite Edge wiring have completed and the backend has published a complete Subject Graph. We choose final publication over Stage A partial materialization because the backend is the source of truth for generated content and client reads/sync must never observe a partial curriculum graph.

## Consequences

- Stage A Topic Lattice artifacts are durable workflow artifacts/checkpoints, not client-visible Learning Content.
- A Stage A cache hit may resume generation, but must not complete a subject-graph run by itself.
- Regenerating an existing subject must keep the old complete graph visible until the replacement graph publish step succeeds.
- Device-scoped Learning Content remains isolated by `device_id`; future auth migration will tighten the same ownership boundary to user identity.
