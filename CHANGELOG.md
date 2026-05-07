# Changelog

## Unreleased

### Phase 4 — Backend-authoritative generation reset

- Declared a destructive reset for generated learning content: browser IndexedDB/localStorage generation data is not migrated.
- Began backend-authoritative generation infrastructure with backend-owned generation policy and Learning Content Store schema/repository foundations.
- Recorded the Cloudflare durable-generation infrastructure split: Workflows for execution, D1 for queryable state, R2 for artifacts/checkpoints, and Durable Objects only for optional coordination.
- Removed Supabase Storage from the artifact path in favor of Cloudflare R2 and documented backend generation settings as backend-owned policy, not persisted device settings.
