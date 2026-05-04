// Barrel for the progression feature.
//
// Phase 4 finalized the layered architecture: there are no longer any
// monolithic root-level modules. The legacy `progressionStore.ts`,
// `progressionUtils.ts`, `actions.ts`, and root-level `coarseRating.ts` /
// `sm2.ts` / `progressionRitual.ts` were removed; all surfaces now flow
// through the layered structure:
//
//   - `stores/`          — Zustand data containers (primitive setters
//                          only).
//   - `orchestrators/`   — cross-store mutation seams (single-call
//                          atomic phases + bus emissions).
//   - `hooks/`           — read-only React adapters (one store + one
//                          policy per hook, with useShallow).
//   - `policies/`        — pure decision functions (no React, no
//                          Zustand).
export * from './crystalCeremonyStore';
export * from './buffs';
export * from './buffDisplay';
export * from './attunement';
export * from './visualization';
export * from './feedbackMessages';

// Policy modules with stable named exports promoted to the public
// surface.
export * from './policies/coarseRating';
export * from './policies/sm2';

// ---------------------------------------------------------------------------
// Stores (Phase 1 step 9): single-responsibility data containers; primitive
// setters only.
// ---------------------------------------------------------------------------

export { useCrystalGardenStore } from './stores/crystalGardenStore';
export type {
	CrystalGardenState,
	CrystalGardenActions,
	CrystalGardenStore,
} from './stores/crystalGardenStore';

// `ATTUNEMENT_SUBMISSION_COOLDOWN_MS` is intentionally not re-exported from
// the barrel. Migrated callers read it from `./stores/studySessionStore`.
export { useStudySessionStore } from './stores/studySessionStore';
export type {
	StudySessionState,
	StudySessionActions,
	StudySessionStore,
} from './stores/studySessionStore';

export { useSM2Store } from './stores/sm2Store';
export type {
	SM2State,
	SM2Actions,
	SM2Store,
} from './stores/sm2Store';

export { useBuffStore } from './stores/buffStore';
export type {
	BuffState,
	BuffActions,
	BuffStore,
} from './stores/buffStore';

// Single-store mutation helpers for AbyssCommandPalette's dev XP-buff toggle.
// Colocated with `buffStore` because they do not cross store boundaries.
export {
	grantBuffFromCatalog,
	toggleBuffFromCatalog,
} from './stores/buffStore';

// Hydration barrier (Fix #1): boot work that touches multiple
// progression stores must run after every persisted slice has resolved
// `persist.hasHydrated()`. Cross-feature consumers (e.g. `app/page.tsx`'s
// boot effect) wrap `crystalGardenOrchestrator.initialize()` with
// `whenProgressionHydrated(...)` so an async storage adapter cannot drop
// persisted active buffs on the floor at boot.
export {
	progressionStoresHydrated,
	whenProgressionHydrated,
} from './hydration';

// Orchestrators (cross-store mutation seams). Imported as namespaces so
// callers can pick the actions they need without ambient name collisions.
export * as studySessionOrchestrator from './orchestrators/studySessionOrchestrator';
export * as crystalGardenOrchestrator from './orchestrators/crystalGardenOrchestrator';

// Read-only hooks. Each hook subscribes to one store and calls one policy.
export { useTopicsByTier } from './hooks/useTopicsByTier';
export { useTopicUnlockStatus } from './hooks/useTopicUnlockStatus';
export { useDueCardsCount } from './hooks/useDueCardsCount';
export { useCrystalLevelProgress } from './hooks/useCrystalLevelProgress';
export { useRemainingRitualCooldownMs } from './hooks/useRemainingRitualCooldownMs';

// Policy entry points. Stable named exports across the rewrite.
export {
	applyCrystalXpDelta,
	calculateXPReward,
	getCrystalLevelProgressToNext,
	getXpToNextBandThreshold,
	type CrystalLevelProgressToNext,
	type CrystalXpDeltaResult,
} from './policies/crystalLeveling';
export {
	attachSm2,
	filterCardsByDifficulty,
	type CardWithSm2,
} from './policies/sessionPolicy';
export {
	calculateTopicTier,
	getTopicUnlockStatus,
	getTopicsByTier,
	getVisibleTopicIds,
	type SubjectLike,
	type TieredTopic,
	type TopicUnlockStatus,
} from './policies/topicUnlocking';
