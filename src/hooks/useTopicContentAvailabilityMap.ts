/**
 * @deprecated Use `useTopicContentStatusMap` from `./useTopicContentStatusMap` instead.
 * This wrapper exists for backward compatibility during migration.
 */
import { useMemo } from 'react';

import { useTopicContentStatusMap } from './useTopicContentStatusMap';

export { topicContentAvailabilityQueryKey } from './useTopicContentStatusMap';
export type { TopicContentStatus } from '@/types/progression';

/**
 * @deprecated Prefer `useTopicContentStatusMap()` for tri-state awareness.
 * Returns a boolean map (true = ready, false = generating or unavailable).
 */
export function useTopicContentAvailabilityMap(): Record<string, boolean> {
  const statusMap = useTopicContentStatusMap();
  return useMemo(() => {
    const boolMap: Record<string, boolean> = {};
    for (const [key, status] of Object.entries(statusMap)) {
      boolMap[key] = status === 'ready';
    }
    return boolMap;
  }, [statusMap]);
}
