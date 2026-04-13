'use client';

import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AbyssDialog,
  AbyssDialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/abyss-dialog';
import type { TieredTopic, TopicUnlockStatus } from '@/features/progression/progressionUtils';
import { triggerTopicUnlockPipeline, useContentGenerationStore } from '@/features/contentGeneration';
import { useTopicDetails } from '@/hooks/useDeckData';

export function scheduleTopicDetailsDismiss(onDismiss: () => void) {
  window.setTimeout(onDismiss, 0);
}

export interface TopicDetailsPopupProps {
  topic: TieredTopic;
  unlockStatus: TopicUnlockStatus;
  isOpen: boolean;
  onClose: () => void;
  onUnlock: () => void;
}

export function TopicDetailsPopup({
  topic,
  unlockStatus,
  isOpen,
  onClose,
  onUnlock,
}: TopicDetailsPopupProps) {
  const isContentAvailable = topic.isContentAvailable;
  const activeJobLabel = useContentGenerationStore((s) => {
    if (!isOpen) return null;
    for (const j of Object.values(s.jobs)) {
      if (
        j.topicId === topic.id &&
        (j.status === 'pending' ||
          j.status === 'streaming' ||
          j.status === 'parsing' ||
          j.status === 'saving')
      ) {
        return j.label;
      }
    }
    return null;
  });
  const detailsQuery = useTopicDetails(topic.subjectId, topic.id);
  const syllabus = detailsQuery.data?.coreQuestionsByDifficulty;
  const isGenerating = activeJobLabel !== null;
  const showGenerateContent = topic.isLocked && !isContentAvailable;

  const handleGenerateContent = () => {
    if (isGenerating) {
      return;
    }
    void triggerTopicUnlockPipeline({ subjectId: topic.subjectId, topicId: topic.id });
  };

  return (
    <AbyssDialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          scheduleTopicDetailsDismiss(onClose);
        }
      }}
    >
      <AbyssDialogContent className="flex max-h-[95vh] min-h-0 w-[min(95%,30rem)] flex-col overflow-hidden rounded-[20px] border border-border bg-card p-3 shadow-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{topic.name}</DialogTitle>
          <DialogDescription>{topic.subjectName}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
          <p className="text-muted-foreground mb-4 text-sm">{topic.description}</p>

          {showGenerateContent ? (
            <p className="text-muted-foreground mb-3 text-sm">
              Generate study content for this topic first. When it finishes, you can unlock and spawn the crystal.
            </p>
          ) : null}

          {!isContentAvailable && !showGenerateContent ? (
            <p className="text-accent-foreground mb-3 text-sm font-semibold">
              Content not available yet for this topic.
            </p>
          ) : null}

          {activeJobLabel ? (
            <p className="text-primary mb-3 text-sm font-medium" role="status">
              Synthesizing knowledge: {activeJobLabel}
            </p>
          ) : null}

          {syllabus ? (
            <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-foreground text-sm font-semibold">Syllabus (core questions)</p>
              {([1, 2, 3] as const).map((tier) => {
                const qs = syllabus[tier];
                if (!qs?.length) {
                  return null;
                }
                return (
                  <div key={tier}>
                    <p className="text-muted-foreground mb-1 text-xs font-medium">Difficulty {tier}</p>
                    <ul className="text-foreground list-inside list-disc space-y-1 text-sm">
                      {qs.map((q, i) => (
                        <li key={`${tier}-${i}`}>{q}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : null}

          {topic.isLocked && !unlockStatus.hasPrerequisites && (
            <div className="mb-4 space-y-2">
              <div className="bg-destructive/10 border-destructive rounded-lg border p-3">
                <Badge variant="destructive" className="mb-2">
                  🔒 Requires prerequisites
                </Badge>
                {unlockStatus.missingPrerequisites.map((prereq) => (
                  <div key={prereq.topicId} className="text-destructive text-sm">
                    • {prereq.topicName} Level {prereq.requiredLevel} (Current: Level{' '}
                    {prereq.currentLevel})
                  </div>
                ))}
              </div>
            </div>
          )}

          {topic.isLocked && showGenerateContent ? (
            <Button
              type="button"
              onClick={handleGenerateContent}
              disabled={isGenerating}
              className="mb-3 w-full min-h-11 rounded-lg border border-primary/30 bg-primary px-6 py-3 font-semibold text-primary-foreground"
            >
              {isGenerating ? activeJobLabel || 'Generating…' : 'Generate content'}
            </Button>
          ) : null}

          {topic.isLocked && (
            <Button
              type="button"
              onClick={onUnlock}
              disabled={!unlockStatus.canUnlock || !isContentAvailable}
              className={`w-full min-h-11 cursor-pointer rounded-lg border-none px-6 py-3 font-semibold transition-all ${
                unlockStatus.canUnlock && isContentAvailable
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
              }`}
            >
              {isContentAvailable
                ? unlockStatus.canUnlock
                  ? 'Unlock & Spawn'
                  : 'Locked'
                : 'Unlock after content is ready'}
            </Button>
          )}

          {topic.isUnlocked && (
            <div className="text-muted-foreground text-center text-sm">
              ✅ This topic is already unlocked
            </div>
          )}
        </div>
      </AbyssDialogContent>
    </AbyssDialog>
  );
}
