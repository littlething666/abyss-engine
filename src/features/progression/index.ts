// Barrel for the progression feature. Phase 2 step 13 dropped the legacy
// `./actions` and `./progressionStore` star re-exports and re-routed the
// `./coarseRating` and `./sm2` star-exports to their byte-faithful
// `./policies/*` counterparts. The legacy modules at the feature root
// remain on disk for the parity gate at `progressionStore.test.ts`; they
// are deleted in Phase 4 (steps 15–18) along with the test itself.
export * from './crystalCeremonyStore';
export * from './buffs';
export * from './buffDisplay';
export * from './attunement';
export * from './visualization';
export * from './feedbackMessages';

// Policy modules with stable named exports promoted to the public
// surface. These replace the legacy `./coarseRating` and `./sm2` star
// re-exports so callers continue to import `SM2Data`, `defaultSM2`,
// `resolveCoarseRating`, etc. from the barrel without going through the
// legacy file paths.
export * from './policies/coarseRating';
export * from './policies/sm2';

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

// `ATTUNEMENT_SUBMISSION_COOLDOWN_MS` is intentionally not re-exported
// from the barrel. The legacy parity test now imports it directly from
// `./progressionStore`, and migrated callers read it from
// `./stores/studySessionStore`.
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
// against any sibling exports during the migration window.
export * as studySessionOrchestrator from './orchestrators/studySessionOrchestrator';
export * as crystalGardenOrchestrator from './orchestrators/crystalGardenOrchestrator';

// Read-only hooks (Phase 1 step 4). Each hook subscribes to one store and
// calls one policy.
export { useTopicsByTier } from './hooks/useTopicsByTier';
export { useTopicUnlockStatus } from './hooks/useTopicUnlockStatus';
export { useDueCardsCount } from './hooks/useDueCardsCount';
export { useCrystalLevelProgress } from './hooks/useCrystalLevelProgress';
export { useRemainingRitualCooldownMs } from './hooks/useRemainingRitualCooldownMs';

// Policy entry points whose names are stable across the rewrite.
//
// `getTopicUnlockStatus` and `getTopicsByTier` are re-exported with
// `FromPolicy` suffixes because the legacy `progressionUtils.ts` still
// exports the same names; that file is deleted in Phase 4 step 17,
// after which the suffix-free names move here.
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
