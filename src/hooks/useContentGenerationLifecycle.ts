import { useEffect } from 'react';

import { useContentGenerationStore } from '@/features/contentGeneration';
import type { ContentGenerationAbortReason } from '@/types/contentGenerationAbort';

/**
 * Aborts all in-flight local generation (pipelines and standalone jobs)
 * when the tab unloads.
 *
 * ## Backend-routed (durable) runs
 *
 * Backend-routed runs survive tab close — their execution lives on the
 * Worker. The `DurableGenerationRunRepository` never registers
 * `AbortController` instances in the `contentGenerationStore`, so this
 * hook naturally skips them. No explicit `backendRoutedJobIds` filter
 * is needed.
 *
 * When `NEXT_PUBLIC_DURABLE_RUNS` is on, only `crystal-trial` runs are
 * backend-routed in Phase 1; all other pipeline kinds continue through
 * the local in-tab runner and still abort on `beforeunload`.
 *
 * The `'navigation'` abort reason is preserved per Plan v3 Q13 until
 * Phase 4 (full local-runner deletion).
 */
export function useContentGenerationLifecycle(): void {
  useEffect(() => {
    const navigationAbortReason: ContentGenerationAbortReason = {
      kind: 'navigation',
      source: 'beforeunload',
    };

    const onBeforeUnload = () => {
      const s = useContentGenerationStore.getState();
      for (const ac of Object.values(s.pipelineAbortControllers)) {
        ac.abort(navigationAbortReason);
      }
      for (const ac of Object.values(s.abortControllers)) {
        ac.abort(navigationAbortReason);
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}
