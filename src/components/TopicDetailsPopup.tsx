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

/**
 * Radix controlled Dialog: if we unmount the details layer synchronously inside
 * onOpenChange(false) (or right after Close), dismiss handling can still reach the
 * sibling Wisdom Altar dialog. Deferring one macrotask lets the inner dialog finish
 * closing first (same effect as setTimeout(..., 0) in app code).
 */
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

          {!isContentAvailable && (
            <p className="text-accent-foreground mb-3 text-sm font-semibold">
              📦 Content not available yet
            </p>
          )}

          {topic.isLocked && (
            <div className="mb-4 space-y-2">
              {unlockStatus.hasPrerequisites && unlockStatus.hasEnoughPoints ? (
                <div className="bg-accent/10 border-accent rounded-lg border p-3">
                  <Badge variant="secondary" className="mb-2">
                    ✅ Prerequisites Met
                  </Badge>
                  <div className="text-muted-foreground text-sm">Cost: 1 Unlock Point</div>
                </div>
              ) : !unlockStatus.hasPrerequisites ? (
                <div className="bg-destructive/10 border-destructive rounded-lg border p-3">
                  <Badge variant="destructive" className="mb-2">
                    🔒 Requires Prerequisites
                  </Badge>
                  {unlockStatus.missingPrerequisites.map((prereq) => (
                    <div key={prereq.topicId} className="text-destructive text-sm">
                      • {prereq.topicName} Level {prereq.requiredLevel} (Current: Level{' '}
                      {prereq.currentLevel})
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <Badge variant="secondary" className="mb-2">
                    ⭐ Unlock point required
                  </Badge>
                  <div className="text-muted-foreground text-sm">
                    Topic prerequisites are met. You have {unlockStatus.unlockPoints} unlock point
                    {unlockStatus.unlockPoints === 1 ? '' : 's'}; unlocking costs 1.
                  </div>
                </div>
              )}
            </div>
          )}

          {topic.isLocked && (
            <Button
              type="button"
              onClick={onUnlock}
              disabled={!unlockStatus.canUnlock || !isContentAvailable}
              className={`w-full cursor-pointer rounded-lg border-none px-6 py-3 font-semibold transition-all ${
                unlockStatus.canUnlock && isContentAvailable
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
              }`}
            >
              {isContentAvailable
                ? unlockStatus.canUnlock
                  ? '🔓 Unlock & Spawn'
                  : '🔒 Locked'
                : '📦 Content Not Available'}
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
