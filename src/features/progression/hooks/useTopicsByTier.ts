import { useMemo } from 'react';

import type { SubjectGraph } from '@/types/core';
import type { TopicContentStatus } from '@/types/progression';

import { useCrystalGardenStore } from '../stores/crystalGardenStore';
import {
	getTopicsByTier,
	type SubjectLike,
} from '../policies/topicUnlocking';

/**
 * Tier-bucketed topic listing for Wisdom Altar / Discovery surfaces.
 *
 * Adapter rule: reads from exactly one store (`crystalGardenStore`) and
 * calls exactly one policy (`getTopicsByTier`).
 *
 * Implementation note: subscribes to the primitive `activeCrystals`
 * array directly and memoizes the policy call with `useMemo`.
 * `useShallow` cannot be used here because the policy result has nested
 * objects (per-tier `{ tier, topics: [...] }`) that are not
 * referentially stable across calls -- `useShallow`'s one-level
 * comparison would rotate its cached reference on every commit and
 * trigger React's `useSyncExternalStore` tearing-detection re-render
 * loop. With a primitive selector plus `useMemo`, zustand's default
 * `Object.is` snapshot comparison gates re-renders by `activeCrystals`
 * identity, so unrelated store fields (e.g. `resonancePoints`) do not
 * cause a re-render -- preserving the same referential-stability
 * property `useShallow` was originally introduced for.
 */
export function useTopicsByTier(
	graphs: SubjectGraph[],
	subjects: SubjectLike[],
	currentSubjectId: string | null | undefined,
	contentStatusByTopicKey?: Record<string, TopicContentStatus>,
): ReturnType<typeof getTopicsByTier> {
	const activeCrystals = useCrystalGardenStore((s) => s.activeCrystals);
	return useMemo(
		() =>
			getTopicsByTier(
				graphs,
				subjects,
				currentSubjectId,
				contentStatusByTopicKey,
				activeCrystals,
			),
		[graphs, subjects, currentSubjectId, contentStatusByTopicKey, activeCrystals],
	);
}
