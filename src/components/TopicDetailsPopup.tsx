'use client';

import React from 'react';

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
  activeTopicContentGenerationLabel,
  useContentGenerationStore,
} from '@/features/contentGeneration';
import { useTopicDetails } from '@/hooks/useDeckData';

import { TopicIcon } from './topicIcons/TopicIcon';

export interface TopicDetailsPopupProps {
  topic: TieredTopic;
  unlockStatus: TopicUnlockStatus;
  isOpen: boolean;
  onClose: () => void;
  onUnlock: () => void;
}

/**
 * Renders the read-only topic detail dialog. The inline generation grid
 * (Theory / Study cards / Mini-games / Full) was removed in the
 * visual-clutter cleanup. Topic content now generates through the auto
 * pipeline triggered on unlock and the content-generation logs panel; this
 * dialog only surfaces *status* of any in-flight job and the unlock CTA.
 */
export function TopicDetailsPopup({
  topic,
  unlockStatus,
  isOpen,
  onClose,
  onUnlock,
}: TopicDetailsPopupProps) {
  const contentStatus = topic.contentStatus;
  const isContentReady = contentStatus === 'ready';
  const isContentGenerating = contentStatus === 'generating';
  const activeJobLabel = useContentGenerationStore((s) => {
    if (!isOpen) return null;
    return activeTopicContentGenerationLabel(s, topic.subjectId, topic.id);
  });
  const detailsQuery = useTopicDetails(topic.subjectId, topic.id);
  const syllabus = detailsQuery.data?.coreQuestionsByDifficulty;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="flex max-h-[95vh] min-h-0 w-[min(95%,30rem)] flex-col overflow-hidden rounded-[20px] border border-border bg-card p-3 shadow-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TopicIcon iconName={topic.iconName} className="size-5 shrink-0 text-primary" />
            <span className="min-w-0 truncate">{topic.name}</span>
          </DialogTitle>
          <DialogDescription>{topic.subjectName}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
          <p className="text-muted-foreground mb-4 text-sm">{topic.description}</p>

          {activeJobLabel ? (
            <p className="text-primary mb-3 text-sm font-medium" role="status">
              Synthesizing knowledge: {activeJobLabel}
            </p>
          ) : null}

          {isContentGenerating && !activeJobLabel ? (
            <p className="text-primary mb-3 text-sm font-medium" role="status">
              ⏳ Content generation in progress…
            </p>
          ) : null}

          {!isContentReady && !isContentGenerating ? (
            <p className="text-accent-foreground mb-3 text-sm font-semibold">
              Content will be generated after unlock.
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
              disabled={!unlockStatus.canUnlock}
              className={`w-full min-h-11 rounded-lg border-none px-6 py-3 font-semibold transition-all ${
                unlockStatus.canUnlock
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground opacity-50'
              }`}
            >
              {unlockStatus.canUnlock ? 'Unlock & Spawn' : 'Locked'}
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
