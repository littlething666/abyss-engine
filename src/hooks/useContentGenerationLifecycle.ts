import { useEffect } from 'react';

import { useContentGenerationStore } from '@/features/contentGeneration';
import type { ContentGenerationAbortReason } from '@/types/contentGenerationAbort';

/**
 * Aborts all in-flight generation (pipelines and standalone jobs) when the tab unloads.
 */
export function useContentGenerationLifecycle(): void {
  useEffect(() => {
    const navigationAbortReason: ContentGenerationAbortReason = { kind: 'navigation', source: 'beforeunload' };
    const onBeforeUnload = () => {
      const s = useContentGenerationStore.getState();
      for (const ac of Object.values(s.pipelineAbortControllers)) ac.abort(navigationAbortReason);
      for (const ac of Object.values(s.abortControllers)) ac.abort(navigationAbortReason);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}
