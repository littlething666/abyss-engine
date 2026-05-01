'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, ListTree, RotateCcw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { CopyableLlmTextBlock } from '@/components/CopyableLlmTextBlock';
import { InfoPopover } from '@/components/InfoPopover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MAX_PERSISTED_LOGS,
  useContentGenerationStore,
  canRetryJob,
  canRetryPipeline,
  retryFailedJob,
  retryFailedPipeline,
} from '@/features/contentGeneration';
import type { ContentGenerationJob, ContentGenerationJobStatus } from '@/types/contentGeneration';
import type { GeneratedCardQualityReport, GeneratedCardValidationFailure } from '@/types/contentQuality';
import { useUIStore } from '@/store/uiStore';

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
  if (status === 'aborted') return 'destructive';
  if (status === 'completed') return 'outline';
  return 'default';
}

function jobSummaryLabel(job: ContentGenerationJob): string {
  if (job.kind === 'subject-graph-topics' && isJobActive(job.status)) {
    return 'Drafting topic lattice';
  }
  if (job.kind === 'subject-graph-edges' && isJobActive(job.status)) {
    return 'Wiring prerequisites';
  }
  if (
    (job.kind === 'subject-graph-topics' || job.kind === 'subject-graph-edges') &&
    (job.status === 'failed' || job.status === 'aborted')
  ) {
    return 'Subject generation needs attention';
  }
  return job.label;
}

function pipelineSummaryLabel(jobs: ContentGenerationJob[]): string {
  const latestJob = [...jobs].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!latestJob) {
    return 'In progress';
  }
  if (latestJob.kind === 'subject-graph-topics' && isJobActive(latestJob.status)) {
    return 'Drafting topic lattice';
  }
  if (latestJob.kind === 'subject-graph-edges' && isJobActive(latestJob.status)) {
    return 'Wiring prerequisites';
  }
  if (
    (latestJob.kind === 'subject-graph-topics' || latestJob.kind === 'subject-graph-edges') &&
    (latestJob.status === 'failed' || latestJob.status === 'aborted')
  ) {
    return 'Subject generation needs attention';
  }
  return latestJob.status === 'completed' ? 'Completed' : 'In progress';
}

function isValidationFailureArray(value: unknown): value is GeneratedCardValidationFailure[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const maybe = item as { code?: unknown; message?: unknown };
    return typeof maybe.code === 'string' && typeof maybe.message === 'string';
  });
}

function isNonEmptyDebugMarkdown(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isQualityReport(value: unknown): value is GeneratedCardQualityReport {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as { emittedCount?: unknown; invalidCount?: unknown; duplicateConceptCount?: unknown };
  return (
    typeof maybe.emittedCount === 'number' &&
    typeof maybe.invalidCount === 'number' &&
    typeof maybe.duplicateConceptCount === 'number'
  );
}

function GenerationJobDetails({ job }: { job: ContentGenerationJob }) {
  const input = job.inputMessages ?? '';
  const raw = job.rawOutput;
  const reasoning = job.reasoningText ?? '';
  const debugMarkdown =
    job.status === 'failed' && isNonEmptyDebugMarkdown(job.metadata?.debugMarkdown)
      ? job.metadata.debugMarkdown
      : null;

  const handleCopyFailureReport = useCallback(() => {
    if (!debugMarkdown) return;
    void navigator.clipboard.writeText(debugMarkdown);
  }, [debugMarkdown]);
  const modelName =
    typeof job.metadata?.model === 'string'
      ? job.metadata.model
      : typeof job.metadata?.modelId === 'string'
        ? job.metadata.modelId
        : undefined;
  const validationFailures = isValidationFailureArray(job.metadata?.validationFailures)
    ? job.metadata.validationFailures
    : [];
  const qualityReport = isQualityReport(job.metadata?.qualityReport) ? job.metadata.qualityReport : null;

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
      {debugMarkdown ? (
        <div className="mt-2 flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={handleCopyFailureReport}
          >
            <Copy className="size-3 shrink-0" aria-hidden />
            Copy failure report (markdown)
          </Button>
        </div>
      ) : null}
      {job.retryOf ? (
        <p className="text-muted-foreground text-[11px]">
          ↻ Retry of job {job.retryOf.slice(0, 8)}…
        </p>
      ) : null}
      {modelName ? <p className="text-muted-foreground text-xs">Model: {modelName}</p> : null}
      {qualityReport ? (
        <div className="rounded border border-border bg-muted/20 p-2 text-xs">
          <p className="text-foreground font-medium">Quality summary</p>
          <p className="text-muted-foreground">
            {qualityReport.validCount}/{qualityReport.emittedCount} cards valid · {qualityReport.invalidCount} invalid · {qualityReport.duplicateConceptCount} duplicate concepts
          </p>
          {qualityReport.groundingSourceCount > 0 ? (
            <p className="text-muted-foreground">
              Grounding: {qualityReport.groundingSourceCount} source{qualityReport.groundingSourceCount === 1 ? '' : 's'}
              {qualityReport.hasAuthoritativePrimarySource ? ', includes authoritative primary source' : ''}
            </p>
          ) : null}
        </div>
      ) : null}
      {validationFailures.length > 0 ? (
        <details className="rounded border border-destructive/40 bg-destructive/5 p-2">
          <summary className="text-destructive text-xs font-medium">
            Validation issues ({validationFailures.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {validationFailures.slice(0, 8).map((failure, index) => (
              <li key={`${failure.code}-${failure.index}-${index}`} className="text-muted-foreground">
                {failure.cardId ?? `card ${failure.index + 1}`}: {failure.message}
              </li>
            ))}
          </ul>
        </details>
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
      <span className="text-foreground text-xs font-medium">{jobSummaryLabel(job)}</span>
    </div>
  );
}

/**
 * Compact scene HUD for LLM content generation; opens a read-only dialog with a unified job list (live + history).
 */
export function GenerationProgressHud() {
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const jobs = useContentGenerationStore((s) => s.jobs);
  const pipelines = useContentGenerationStore((s) => s.pipelines);
  const abortJob = useContentGenerationStore((s) => s.abortJob);
  const abortPipeline = useContentGenerationStore((s) => s.abortPipeline);
  const clearCompletedJobs = useContentGenerationStore((s) => s.clearCompletedJobs);
  const open = useUIStore((s) => s.isGenerationProgressOpen);
  const openGenerationProgress = useUIStore((s) => s.openGenerationProgress);
  const setGenerationProgressOpen = useUIStore((s) => s.setGenerationProgressOpen);

  const handleOpenChange = useCallback((next: boolean) => {
    setGenerationProgressOpen(next);
    if (!next) setRetryingIds(new Set());
  }, [setGenerationProgressOpen]);

  useEffect(() => {
    if (!open) {
      setRetryingIds(new Set());
    }
  }, [open]);

  const markRetrying = useCallback((id: string) => {
    setRetryingIds((prev) => new Set(prev).add(id));
  }, []);

  const activeJobs = useMemo(
    () => Object.values(jobs).filter((j) => isJobActive(j.status)),
    [jobs],
  );
  const isBusy = activeJobs.length > 0;

  const { activeStandalone, pipelineIdsOrdered, activeByPipeline, terminalSorted, terminalPipelineGroups } = useMemo(() => {
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

    const termPipelineMap = new Map<string, ContentGenerationJob[]>();
    for (const j of terminal) {
      if (j.pipelineId) {
        const list = termPipelineMap.get(j.pipelineId) ?? [];
        list.push(j);
        termPipelineMap.set(j.pipelineId, list);
      }
    }

    return {
      activeStandalone: standalone,
      activeByPipeline: pipelineGroups,
      pipelineIdsOrdered: pipelineIds,
      terminalSorted: terminal,
      terminalPipelineGroups: termPipelineMap,
    };
  }, [jobs, pipelines]);

  return (
    <>
      <div
        className="text-foreground flex h-7 items-center gap-1 self-end rounded-lg border border-surface-hud-border bg-surface-hud px-2 py-1"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={isBusy ? 'motion-safe:animate-pulse' : undefined}
          onClick={openGenerationProgress}
          aria-label="Open background LLM content generation"
          title="Open background LLM content generation"
        >
          {isBusy ? (
            <Spinner className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ListTree className="size-3.5 shrink-0" aria-hidden />
          )}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[85vh] w-[min(100%,28rem)] max-w-[28rem] flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Background LLM content generation</DialogTitle>
            <DialogDescription className="flex items-center gap-1">
              <span className="min-w-0">
                Active generation jobs, plus your last {MAX_PERSISTED_LOGS} runs.
              </span>
              <InfoPopover label="About background generation">
                <p>
                  Stream output from running content-generation jobs and retry failed pipelines from the failed stage
                  — no need to re-unlock the topic.
                </p>
              </InfoPopover>
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
                              Pipeline: {agg === 'active' ? pipelineSummaryLabel(groupJobs) : agg}
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
                  {terminalSorted.map((j) => {
                    const pipelineMeta = j.pipelineId ? pipelines[j.pipelineId] : undefined;
                    const pipelineJobs = j.pipelineId ? terminalPipelineGroups.get(j.pipelineId) : undefined;
                    const showPipelineRetry =
                      pipelineMeta &&
                      pipelineJobs &&
                      canRetryPipeline(pipelineMeta, pipelineJobs) &&
                      pipelineJobs.find((pj) => pj.status === 'failed' || pj.status === 'aborted')?.id === j.id;

                    const isRetryableJob = j.status === 'failed' || j.status === 'aborted';

                    return (
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
                          {jobSummaryLabel(j)}
                          {j.finishedAt ? (
                            <span className="text-muted-foreground ml-2 text-xs font-normal">
                              {new Date(j.finishedAt).toLocaleString()}
                            </span>
                          ) : null}
                        </summary>
                        <div className="border-border border-t px-3 py-2">
                          <GenerationJobDetails job={j} />
                          {isRetryableJob ? (
                            <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-2">
                              {canRetryJob(j) && j.pipelineId === null ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5 text-xs"
                                  disabled={retryingIds.has(j.id)}
                                  onClick={() => {
                                    markRetrying(j.id);
                                    void retryFailedJob(j);
                                  }}
                                >
                                  <RotateCcw className="size-3" aria-hidden />
                                  {retryingIds.has(j.id) ? 'Retrying…' : 'Retry job'}
                                </Button>
                              ) : null}
                              {canRetryJob(j) && j.pipelineId !== null ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5 text-xs"
                                  disabled={retryingIds.has(j.id)}
                                  onClick={() => {
                                    markRetrying(j.id);
                                    void retryFailedJob(j);
                                  }}
                                >
                                  <RotateCcw className="size-3" aria-hidden />
                                  {retryingIds.has(j.id) ? 'Retrying…' : 'Retry this stage'}
                                </Button>
                              ) : null}
                              {showPipelineRetry && j.pipelineId ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5 text-xs"
                                  disabled={retryingIds.has(j.pipelineId)}
                                  onClick={() => {
                                    markRetrying(j.pipelineId!);
                                    void retryFailedPipeline(j.pipelineId!);
                                  }}
                                >
                                  <RotateCcw className="size-3" aria-hidden />
                                  {retryingIds.has(j.pipelineId) ? 'Retrying…' : 'Retry pipeline from failed stage'}
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => clearCompletedJobs()}>
              Clear history
            </Button>
            <Button type="button" size="sm" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
