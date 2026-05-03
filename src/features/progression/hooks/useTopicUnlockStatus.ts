import { useMemo } from 'react';

import type { SubjectGraph, TopicRef } from '@/types/core';

import { useCrystalGardenStore } from '../stores/crystalGardenStore';
import {
	getTopicUnlockStatus,
	type TopicUnlockStatus,
} from '../policies/topicUnlocking';

/**
 * Resolve a topic's unlock eligibility from the current crystal-garden
 * snapshot. Adapter rule: reads exactly one store and calls exactly one
 * policy.
 *
 * Implementation note: subscribes to the two primitive store fields
 * (`activeCrystals`, `unlockPoints`) directly and memoizes the policy
 * call with `useMemo`. `useShallow` cannot be used here because the
 * policy result has nested arrays (`missingPrerequisites: []`) that are
 * not referentially stable across calls -- `useShallow`'s one-level
 * comparison would rotate its cached reference on every commit and
 * trigger React's `useSyncExternalStore` tearing-detection re-render
 * loop. With primitive selectors plus `useMemo`, zustand's default
 * `Object.is` snapshot comparison gates re-renders by store-field
 * identity, and the policy is recomputed only when one of those
 * primitives or the static `ref` / `allGraphs` inputs changes.
 */
export function useTopicUnlockStatus(
	ref: TopicRef,
	allGraphs: SubjectGraph[],
): TopicUnlockStatus {
	const activeCrystals = useCrystalGardenStore((s) => s.activeCrystals);
	const unlockPoints = useCrystalGardenStore((s) => s.unlockPoints);
	return useMemo(
		() => getTopicUnlockStatus(ref, activeCrystals, unlockPoints, allGraphs),
		[ref, activeCrystals, unlockPoints, allGraphs],
	);
}
