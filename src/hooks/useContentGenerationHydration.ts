import { useEffect, useRef } from 'react';

import { useContentGenerationStore } from '@/features/contentGeneration';
import { loadPersistedLogs } from '@/infrastructure/repositories/contentGenerationLogRepository';

/**
 * Loads persisted terminal job logs from IndexedDB once on mount.
 */
export function useContentGenerationHydration(): void {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void loadPersistedLogs().then(({ jobs, pipelines }) => {
      useContentGenerationStore.getState().hydrateFromPersisted(jobs, pipelines);
    });
  }, []);
}
