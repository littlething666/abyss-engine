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
 * Runtime generation is durable-only; this hook remains only until the
 * remaining local-runner store fields are deleted. Durable Worker runs are
 * never aborted by navigation.
 *
 * The `'navigation'` abort reason is a local-runner deletion target.
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
