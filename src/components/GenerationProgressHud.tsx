'use client';

import React, { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  AbyssDialog,
  AbyssDialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/abyss-dialog';
import {
  labelForTopicGenerationPhase,
  useContentGenerationStore,
  type TopicGenerationPhase,
} from '@/features/topicContentGeneration';
import { topicDetailsQueryKey, useManifest } from '@/hooks/useDeckData';
import { deckRepository } from '@/infrastructure/di';
import { selectRecentTopicGenerationLogs } from '@/lib/recentTopicGenerationLogs';

import { GenerationIoSection } from './GenerationIoSection';

const DEFAULT_STALE_TIME = Number.POSITIVE_INFINITY;

function firstActiveTopicPhase(
  byTopicId: Record<string, TopicGenerationPhase | undefined>,
): TopicGenerationPhase | undefined {
  for (const phase of Object.values(byTopicId)) {
    if (phase !== undefined) {
      return phase;
    }
  }
  return undefined;
}

/**
 * Compact scene HUD for LLM content generation; opens a read-only dialog (activity timeline + recent topic I/O).
 */
export function GenerationProgressHud() {
  const [open, setOpen] = useState(false);
  const crystalExpansion = useContentGenerationStore((s) => s.crystalExpansion);
  const activityTimeline = useContentGenerationStore((s) => s.activityTimeline);
  const clearActivityTimeline = useContentGenerationStore((s) => s.clearActivityTimeline);
  const byTopicId = useContentGenerationStore((s) => s.byTopicId);
  const generationIoLogByTopicId = useContentGenerationStore((s) => s.generationIoLogByTopicId);

  const topicPhase = useMemo(() => firstActiveTopicPhase(byTopicId), [byTopicId]);
  const crystalBusy = crystalExpansion.active;
  const topicBusy = topicPhase !== undefined;
  const isActive = crystalBusy || topicBusy;

  const topicLine = labelForTopicGenerationPhase(topicPhase);
  const statusLabel =
    crystalBusy && crystalExpansion.statusLine
      ? crystalExpansion.statusLine
      : topicBusy && topicLine
        ? topicLine
        : 'Generation idle';

  const recentLogs = useMemo(
    () => selectRecentTopicGenerationLogs(generationIoLogByTopicId),
    [generationIoLogByTopicId],
  );

  const manifestQuery = useManifest();
  const subjectNameById = useMemo(() => {
    const subjects = manifestQuery.data?.subjects ?? [];
    const map = new Map<string, string>();
    for (const s of subjects) {
      map.set(s.id, s.name);
    }
    return map;
  }, [manifestQuery.data?.subjects]);

  const topicDetailsQueries = useQueries({
    queries: recentLogs.map((ioLog) => ({
      queryKey: topicDetailsQueryKey(ioLog.subjectId, ioLog.topicId),
      queryFn: () => deckRepository.getTopicDetails(ioLog.subjectId, ioLog.topicId),
      enabled: Boolean(ioLog.subjectId && ioLog.topicId),
      staleTime: DEFAULT_STALE_TIME,
    })),
  });

  return (
    <>
      <div className="bg-card/90 text-foreground flex max-w-[min(100%,15rem)] items-center gap-2 self-end rounded-lg border border-border px-2 py-1.5 text-xs shadow-md backdrop-blur-sm">
        <Sparkles
          className={`size-3.5 shrink-0 ${isActive ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate" title={statusLabel}>
          {statusLabel}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={() => setOpen(true)}
          aria-label="Open background LLM content generation"
        >
          Info
        </Button>
      </div>

      <AbyssDialog open={open} onOpenChange={setOpen}>
        <AbyssDialogContent className="flex max-h-[85vh] w-[min(100%,28rem)] max-w-[28rem] flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Background LLM content generation</DialogTitle>
            <DialogDescription>
              Activity timeline and recent structured I/O for topic content runs.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <section>
              <h3 className="text-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                Activity timeline
              </h3>
              <div className="rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
                {activityTimeline.length === 0 ? (
                  <p className="text-muted-foreground">
                    {recentLogs.length > 0
                      ? 'No timeline entries yet. Expansion jobs and log lines appear here.'
                      : 'No entries yet.'}
                  </p>
                ) : (
                  activityTimeline.map((entry) => (
                    <div key={entry.id} className="border-border/60 border-b py-1 last:border-b-0">
                      <span className="text-muted-foreground">{new Date(entry.at).toLocaleTimeString()} — </span>
                      {entry.message}
                    </div>
                  ))
                )}
              </div>
            </section>
            <section>
              <h3 className="text-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                Recent topic runs
              </h3>
              {recentLogs.length === 0 ? (
                <p className="text-muted-foreground text-sm">No topic generation runs recorded yet.</p>
              ) : (
                recentLogs.map((ioLog, index) => {
                  const detailsQuery = topicDetailsQueries[index];
                  const topicTitle = detailsQuery?.data?.title;
                  const subjectName = subjectNameById.get(ioLog.subjectId) ?? ioLog.subjectId;
                  const heading = topicTitle
                    ? `${topicTitle} · ${subjectName}`
                    : `${ioLog.topicId} · ${subjectName}`;

                  return (
                    <div key={`${ioLog.topicId}-${ioLog.startedAt}`} className="mb-4 last:mb-0">
                      <p className="text-foreground mb-2 text-xs font-semibold">{heading}</p>
                      {detailsQuery?.isLoading ? (
                        <p className="text-muted-foreground mb-2 text-xs">Loading topic title…</p>
                      ) : null}
                      {detailsQuery?.isError ? (
                        <p className="text-muted-foreground mb-2 text-xs" role="status">
                          Topic details unavailable; showing I/O only.
                        </p>
                      ) : null}
                      <GenerationIoSection ioLog={ioLog} className="mb-0" />
                    </div>
                  );
                })
              )}
            </section>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => clearActivityTimeline()}>
              Clear activity timeline
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </AbyssDialogContent>
      </AbyssDialog>
    </>
  );
}
