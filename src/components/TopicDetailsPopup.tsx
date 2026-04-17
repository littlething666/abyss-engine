'use client';

import React, { useCallback } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TieredTopic, TopicUnlockStatus } from '@/features/progression/progressionUtils';
import {
  activeTopicGenerationLabel,
  triggerTopicGenerationPipeline,
  useContentGenerationStore,
  type TopicGenerationStage,
} from '@/features/contentGeneration';
import { useTopicDetails } from '@/hooks/useDeckData';

/**
 * Controlled Dialog: if we unmount the details layer synchronously inside
 * onOpenChange(false) (or right after Close), dismiss handling can still reach the
 * sibling Wisdom Altar dialog. Deferring one macrotask lets the inner dialog finish
 * closing first (same effect as setTimeout(..., 0) in app code).
 */
export function scheduleTopicDetailsDismiss(onDismiss: () => void) {
  window.setTimeout(onDismiss, 0);
}

const GENERATION_STEPS: readonly TopicGenerationStage[] = [
  'theory',
  'study-cards',
  'mini-games',
  'full',
] as const;

function stepButtonLabel(stage: TopicGenerationStage): string {
  switch (stage) {
    case 'theory':
      return 'Theory';
    case 'study-cards':
      return 'Study cards';
    case 'mini-games':
      return 'Mini-games';
    case 'full':
      return 'Full';
    default:
      return stage;
  }
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
    return activeTopicGenerationLabel(s, topic.subjectId, topic.id);
  });
  const detailsQuery = useTopicDetails(topic.subjectId, topic.id);
  const syllabus = detailsQuery.data?.coreQuestionsByDifficulty;
  const isGenerating = activeJobLabel !== null;

  const runGenerationStep = useCallback(
    (stage: TopicGenerationStage) => {
      if (isGenerating) {
        return;
      }
      void triggerTopicGenerationPipeline(topic.subjectId, topic.id, {
        forceRegenerate: true,
        stage,
      });
    },
    [isGenerating, topic.id, topic.subjectId],
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          scheduleTopicDetailsDismiss(onClose);
        }
      }}
    >
      <DialogContent className="flex max-h-[95vh] min-h-0 w-[min(95%,30rem)] flex-col overflow-hidden rounded-[20px] border border-border bg-card p-3 shadow-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{topic.name}</DialogTitle>
          <DialogDescription>{topic.subjectName}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
          <p className="text-muted-foreground mb-4 text-sm">{topic.description}</p>

          <p className="text-muted-foreground mb-3 text-sm">
            Run one generation step, or the full sequence. Each step replaces existing generated content for
            that part of the deck.
          </p>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {GENERATION_STEPS.map((stage) => (
              <Button
                key={stage}
                type="button"
                variant="secondary"
                className="min-h-11 w-full"
                disabled={isGenerating}
                onClick={() => runGenerationStep(stage)}
                aria-label={`Generate ${stepButtonLabel(stage)} for this topic`}
              >
                {stepButtonLabel(stage)}
              </Button>
            ))}
          </div>

          {activeJobLabel ? (
            <p className="text-primary mb-3 text-sm font-medium" role="status">
              Synthesizing knowledge: {activeJobLabel}
            </p>
          ) : null}

          {!isContentAvailable ? (
            <p className="text-accent-foreground mb-3 text-sm font-semibold">
              Study-ready content is not loaded yet for this topic (theory plus at least one difficulty-1
              card).
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
            <div className="text-muted-foreground mt-3 text-center text-sm">
              This topic is already unlocked
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
