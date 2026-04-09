import { useEffect } from 'react';

import { useContentGenerationStore } from '@/features/contentGeneration';

/**
 * Aborts all in-flight generation (pipelines and standalone jobs) when the tab unloads.
 */
export function useContentGenerationLifecycle(): void {
  useEffect(() => {
    const onBeforeUnload = () => {
      const s = useContentGenerationStore.getState();
      for (const ac of Object.values(s.pipelineAbortControllers)) ac.abort();
      for (const ac of Object.values(s.abortControllers)) ac.abort();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}
