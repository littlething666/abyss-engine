'use client';

import React, { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyableLlmTextBlock } from '@/components/CopyableLlmTextBlock';
import {
  AbyssDialog,
  AbyssDialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/abyss-dialog';
import { MAX_PERSISTED_LOGS, useContentGenerationStore } from '@/features/contentGeneration';
import type { ContentGenerationJob, ContentGenerationJobStatus } from '@/types/contentGeneration';

function isJobActive(status: ContentGenerationJobStatus): boolean {
  return (
    status === 'pending' ||
    status === 'streaming' ||
    status === 'parsing' ||
    status === 'saving'
  );
}

function pipelineAggregateStatus(
  jobs: ContentGenerationJob[],
): 'active' | 'completed' | 'failed' | 'aborted' {
  if (jobs.some((j) => j.status === 'aborted')) return 'aborted';
  if (jobs.some((j) => j.status === 'failed')) return 'failed';
  if (jobs.every((j) => j.status === 'completed')) return 'completed';
  return 'active';
}

function statusBadgeLabel(status: ContentGenerationJobStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'streaming':
      return 'Streaming';
    case 'parsing':
      return 'Parsing';
    case 'saving':
      return 'Saving';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
    case 'aborted':
      return 'Aborted';
    default:
      return status;
  }
}

function terminalBadgeVariant(
  status: ContentGenerationJobStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'failed') return 'destructive';
  if (status === 'aborted') return 'secondary';
  if (status === 'completed') return 'outline';
  return 'default';
}

function GenerationJobDetails({ job }: { job: ContentGenerationJob }) {
  const input = job.inputMessages ?? '';
  const raw = job.rawOutput;
  const reasoning = job.reasoningText ?? '';

  return (
    <div className="border-border/60 mt-2 space-y-2 border-t pt-2">
      {job.error ? (
        <p className="text-destructive text-xs" role="alert">
          {job.error}
        </p>
      ) : null}
      {job.parseError ? (
        <p className="text-destructive text-xs" role="alert">
          Parse: {job.parseError}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">Input (messages)</p>
      <CopyableLlmTextBlock
        copyText={input}
        aria-label="Generation input messages"
        preClassName="max-h-36"
      />
      <p className="text-muted-foreground text-xs">Output (raw model)</p>
      <CopyableLlmTextBlock
        copyText={raw}
        emptyDisplay="(empty)"
        aria-label="Generation raw model output"
        preClassName="max-h-48"
      />
      {reasoning.trim() ? (
        <>
          <p className="text-muted-foreground text-xs">Reasoning</p>
          <CopyableLlmTextBlock
            copyText={reasoning}
            aria-label="Model reasoning"
            preClassName="max-h-32"
          />
        </>
      ) : null}
    </div>
  );
}

function JobRowSummary({ job }: { job: ContentGenerationJob }) {
  const busy = isJobActive(job.status);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={busy ? 'default' : terminalBadgeVariant(job.status)}>
        {statusBadgeLabel(job.status)}
      </Badge>
      <span className="text-foreground text-xs font-medium">{job.label}</span>
    </div>
  );
}

/**
 * Compact scene HUD for LLM content generation; opens a read-only dialog with a unified job list (live + history).
 */
export function GenerationProgressHud() {
  const [open, setOpen] = useState(false);
  const jobs = useContentGenerationStore((s) => s.jobs);
  const pipelines = useContentGenerationStore((s) => s.pipelines);
  const abortJob = useContentGenerationStore((s) => s.abortJob);
  const abortPipeline = useContentGenerationStore((s) => s.abortPipeline);
  const clearCompletedJobs = useContentGenerationStore((s) => s.clearCompletedJobs);

  const activeJobs = useMemo(
    () => Object.values(jobs).filter((j) => isJobActive(j.status)),
    [jobs],
  );
  const isBusy = activeJobs.length > 0;
  const statusLabel =
    !isBusy ? 'Generation idle' : activeJobs.length === 1 ? activeJobs[0]!.label : `${activeJobs.length} jobs running`;

  const { activeStandalone, pipelineIdsOrdered, activeByPipeline, terminalSorted } = useMemo(() => {
    const all = Object.values(jobs);
    const active = all.filter((j) => isJobActive(j.status));
    const terminal = all.filter((j) => !isJobActive(j.status));
    terminal.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));

    const standalone = active.filter((j) => j.pipelineId === null);
    const pipelineGroups = new Map<string, ContentGenerationJob[]>();
    for (const j of active) {
      if (j.pipelineId) {
        const list = pipelineGroups.get(j.pipelineId) ?? [];
        list.push(j);
        pipelineGroups.set(j.pipelineId, list);
      }
    }
    for (const list of pipelineGroups.values()) {
      list.sort((a, b) => a.createdAt - b.createdAt);
    }

    const pipelineIds = [...pipelineGroups.keys()].sort(
      (a, b) => (pipelines[a]?.createdAt ?? 0) - (pipelines[b]?.createdAt ?? 0),
    );

    return {
      activeStandalone: standalone,
      activeByPipeline: pipelineGroups,
      pipelineIdsOrdered: pipelineIds,
      terminalSorted: terminal,
    };
  }, [jobs, pipelines]);

  return (
    <>
      <div className="bg-card/90 text-foreground flex max-w-[min(100%,15rem)] items-center gap-2 self-end rounded-lg border border-border px-2 py-1.5 text-xs shadow-md backdrop-blur-sm">
        <Sparkles
          className={`size-3.5 shrink-0 ${isBusy ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}
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
              Active jobs with live output and up to {MAX_PERSISTED_LOGS} terminal runs in memory and on this device.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <section>
              <h3 className="text-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">Active</h3>
              {activeStandalone.length === 0 && pipelineIdsOrdered.length === 0 ? (
                <p className="text-muted-foreground text-sm">No jobs in progress.</p>
              ) : (
                <div className="space-y-3">
                  {pipelineIdsOrdered.map((pid) => {
                    const groupJobs = activeByPipeline.get(pid) ?? [];
                    const meta = pipelines[pid];
                    const agg = pipelineAggregateStatus(groupJobs);
                    return (
                      <div key={pid} className="rounded-md border border-border bg-muted/30 p-2">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-foreground text-xs font-semibold">{meta?.label ?? pid}</p>
                            <p className="text-muted-foreground text-[11px]">
                              Pipeline: {agg === 'active' ? 'In progress' : agg}
                            </p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => abortPipeline(pid)}>
                            Abort pipeline
                          </Button>
                        </div>
                        <ul className="border-border/50 space-y-2 border-l-2 pl-3">
                          {groupJobs.map((j) => (
                            <li key={j.id}>
                              <details className="rounded bg-muted/20 [&_summary::-webkit-details-marker]:hidden">
                                <summary className="cursor-pointer px-2 py-1.5 text-xs">
                                  <JobRowSummary job={j} />
                                </summary>
                                <div className="px-2 pb-2">
                                  <GenerationJobDetails job={j} />
                                </div>
                              </details>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                  {activeStandalone.map((j) => (
                    <div
                      key={j.id}
                      className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2 sm:flex-row sm:items-start"
                    >
                      <details
                        className="min-w-0 flex-1 rounded [&_summary::-webkit-details-marker]:hidden"
                        open={isJobActive(j.status)}
                      >
                        <summary className="cursor-pointer px-1 py-1 text-xs">
                          <JobRowSummary job={j} />
                        </summary>
                        <div className="px-1 pb-2">
                          <GenerationJobDetails job={j} />
                        </div>
                      </details>
                      {isJobActive(j.status) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full shrink-0 sm:w-auto"
                          onClick={() => abortJob(j.id)}
                        >
                          Abort
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">History</h3>
              {terminalSorted.length === 0 ? (
                <p className="text-muted-foreground text-sm">No completed or failed runs yet.</p>
              ) : (
                <div className="space-y-2">
                  {terminalSorted.map((j) => (
                    <details
                      key={j.id}
                      className="border-border bg-muted/20 rounded-md border"
                      open={j.status === 'failed'}
                    >
                      <summary className="px-3 py-2 text-sm font-semibold">
                        <span className="mr-2 inline-flex align-middle">
                          <Badge variant={terminalBadgeVariant(j.status)} className="text-[10px]">
                            {statusBadgeLabel(j.status)}
                          </Badge>
                        </span>
                        {j.label}
                        {j.finishedAt ? (
                          <span className="text-muted-foreground ml-2 text-xs font-normal">
                            {new Date(j.finishedAt).toLocaleString()}
                          </span>
                        ) : null}
                      </summary>
                      <div className="border-border border-t px-3 py-2">
                        <GenerationJobDetails job={j} />
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => clearCompletedJobs()}>
              Clear history
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
