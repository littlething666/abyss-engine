# Changelog

## Unreleased

### Phase 4 — Backend-authoritative generation reset

- Declared a destructive reset for generated learning content: browser IndexedDB/localStorage generation data is not migrated.
- Began backend-authoritative generation infrastructure with backend-owned generation policy and D1-backed Learning Content Store schema/repository foundations.
- Replaced active backend Supabase repository usage with Cloudflare D1 adapters while keeping R2 for artifact bodies.
- Recorded the Cloudflare durable-generation infrastructure split: Workflows for execution, D1 for queryable state, R2 for artifacts/checkpoints, and Durable Objects only for optional coordination.
- Removed Supabase Storage from the artifact path in favor of Cloudflare R2 and documented backend generation settings as backend-owned policy, not persisted device settings.
- Added backend Learning Content read routes and a frontend `BackendDeckRepository` adapter, wired for durable backend mode through infrastructure-only HTTP seams.
