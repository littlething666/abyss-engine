'use client';

import React from 'react';

import { cn } from '@/lib/utils';
import type { TopicGenerationIoLog } from '@/features/topicContentGeneration';

import { CopyableLlmTextBlock } from './CopyableLlmTextBlock';

export interface GenerationIoSectionProps {
  ioLog: TopicGenerationIoLog;
  className?: string;
}

export function GenerationIoSection({ ioLog, className }: GenerationIoSectionProps) {
  return (
    <details
      className={cn('border-border bg-muted/20 mb-4 rounded-lg border', className)}
      open={ioLog.ok === false}
    >
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Generation I/O (last run)</summary>
      <div className="border-border space-y-3 border-t px-3 py-3">
        <p className="text-muted-foreground text-xs">
          Started {new Date(ioLog.startedAt).toISOString()}
          {ioLog.finishedAt ? ` · Finished ${new Date(ioLog.finishedAt).toISOString()}` : ''}
          {ioLog.ok === true ? ' · OK' : ''}
          {ioLog.ok === false ? ' · Failed' : ''}
        </p>
        {ioLog.finalError ? (
          <p className="text-destructive text-sm" role="alert">
            {ioLog.finalError}
          </p>
        ) : null}
        {(['theory', 'studyCards', 'miniGames'] as const).map((key) => {
          const stage = ioLog[key];
          if (!stage) {
            return null;
          }
          const label =
            key === 'theory' ? 'Theory' : key === 'studyCards' ? 'Study cards' : 'Mini-games';
          return (
            <div key={key} className="space-y-1">
              <p className="text-foreground text-xs font-semibold">{label}</p>
              {stage.error ? (
                <p className="text-destructive text-xs" role="alert">
                  {stage.error}
                </p>
              ) : null}
              <p className="text-muted-foreground text-xs">Input (messages)</p>
              <CopyableLlmTextBlock
                copyText={stage.input}
                aria-label="Generation input messages"
                preClassName="max-h-36"
              />
              <p className="text-muted-foreground text-xs">Output (raw model)</p>
              <CopyableLlmTextBlock
                copyText={stage.output}
                emptyDisplay="(empty)"
                aria-label="Generation raw model output"
                preClassName="max-h-48"
              />
            </div>
          );
        })}
      </div>
    </details>
  );
}
