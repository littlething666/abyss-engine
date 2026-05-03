// Existing barrel exports -- kept verbatim as transitional re-exports so
// Phase 2 callers can migrate one file at a time without breaking the
// build. They will be removed in Phase 2 step 13 once every caller has
// switched to the new stores / orchestrators / hooks.
export * from './actions';
export * from './coarseRating';
export * from './crystalCeremonyStore';
export * from './progressionStore';
export * from './buffs';
export * from './buffDisplay';
export * from './sm2';
export * from './attunement';
export * from './visualization';
export * from './feedbackMessages';

// ---------------------------------------------------------------------------
// Phase 1 step 9: surface the four new stores, orchestrators, hooks.
// ---------------------------------------------------------------------------

// Stores (single-responsibility data containers; primitive setters only).
export { useCrystalGardenStore } from './stores/crystalGardenStore';
export type {
	CrystalGardenState,
	CrystalGardenActions,
	CrystalGardenStore,
} from './stores/crystalGardenStore';

// `ATTUNEMENT_SUBMISSION_COOLDOWN_MS` is also re-exported through
// `progressionStore.ts` (the legacy location), so we don't re-export it
// here to avoid duplicate-symbol noise. Callers that already migrated to
// the new store import it directly from `./stores/studySessionStore`.
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

// Phase 2 step 10 (writer migration round): single-store mutation helpers
// for AbyssCommandPalette's dev XP-buff toggle. Colocated with `buffStore`
// because they do not cross store boundaries; the legacy writers of the
// same names remain bound to `useProgressionStore.getState()` and stay
// alive for the existing `progressionStore.test.ts` parity gate until
// Phase 4 step 15 deletes the monolith.
export {
	grantBuffFromCatalog,
	toggleBuffFromCatalog,
} from './stores/buffStore';

// Orchestrators (cross-store mutation seams). Imported as namespaces so
// callers can pick the actions they need without ambient name collisions
// against the legacy `progressionStore.ts` re-exports above (e.g. both
// surfaces export `submitStudyResult` during the migration window).
export * as studySessionOrchestrator from './orchestrators/studySessionOrchestrator';
export * as crystalGardenOrchestrator from './orchestrators/crystalGardenOrchestrator';

// Read-only hooks (Phase 1 step 4). Each hook subscribes to one store and
// calls one policy.
export { useTopicsByTier } from './hooks/useTopicsByTier';
export { useTopicUnlockStatus } from './hooks/useTopicUnlockStatus';
export { useDueCardsCount } from './hooks/useDueCardsCount';
export { useCrystalLevelProgress } from './hooks/useCrystalLevelProgress';
export { useRemainingRitualCooldownMs } from './hooks/useRemainingRitualCooldownMs';

// Policy entry points whose names are stable across the rewrite. Other
// progressionUtils helpers continue to be re-exported through `./actions`
// (transitional) until Phase 4 step 18 deletes the old location.
//
// `getTopicUnlockStatus` and `getTopicsByTier` are re-exported with
// `FromPolicy` suffixes because the legacy `progressionUtils.ts` already
// exports the same names. After Phase 2 caller migration the suffix-free
// names move here.
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
	getTopicUnlockStatus as getTopicUnlockStatusFromPolicy,
	getTopicsByTier as getTopicsByTierFromPolicy,
	getVisibleTopicIds,
	type SubjectLike,
	type TieredTopic,
	type TopicUnlockStatus,
} from './policies/topicUnlocking';
