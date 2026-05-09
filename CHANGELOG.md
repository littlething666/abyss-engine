# Changelog

## Unreleased

### Phase 4 — Backend-authoritative generation reset

- Declared a destructive reset for generated learning content: browser IndexedDB/localStorage generation data is not migrated.
- Began backend-authoritative generation infrastructure with backend-owned generation policy and D1-backed Learning Content Store schema/repository foundations.
- Replaced active backend Supabase repository usage with Cloudflare D1 adapters while keeping R2 for artifact bodies.
- Recorded the Cloudflare durable-generation infrastructure split: Workflows for execution, D1 for queryable state, R2 for artifacts/checkpoints, and Durable Objects only for optional coordination.
- Removed Supabase Storage from the artifact path in favor of Cloudflare R2 and documented backend generation settings as backend-owned policy, not persisted device settings.
- Added backend Learning Content read routes and a frontend `BackendDeckRepository` adapter, wired for durable backend mode through infrastructure-only HTTP seams.
- Added backend-owned durable prompt modules and moved workflow prompt construction out of inline workflow code.
- Started local-workflow removal by introducing intent-only frontend generation submissions: `GenerationClient` no longer builds snapshots or hashes inputs, and the durable adapter posts `{ kind, intent }` bodies without client policy fields.
- Converted runtime generation entry paths and retry routing to intent/durable endpoints: event-bus generation requests and command-palette trial regeneration no longer prepare frontend snapshots or resolve pipeline models, and HUD retries call `GenerationClient.retry()`.
- Removed the frontend Generation Progress HUD and quick action; topic readiness UI now relies on backend Topic Content Status instead of store-backed active generation jobs.
- Converted durable run observation from frontend artifact application to backend content-refresh consumption: artifact events are progress-only, terminal events invalidate Learning Content Store query keys, and `wireGenerationClient` no longer constructs frontend generation appliers.
- Removed browser generation-log hydration from `useContentGenerationHydration`; mount-time durable observation now uses compact intents derived from Worker snapshots and fails loudly on malformed Worker snapshot contracts.
- Removed browser-owned generation pipeline settings from Global Settings and `studySettingsStore`; only study explanation surfaces keep model/provider bindings, while durable generation model and response-healing policy are backend-owned.
