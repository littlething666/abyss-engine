import React, { useEffect, useMemo, useState } from 'react';
import type { SubjectGraph, TopicRef } from '@/types/core';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { useAllGraphs, useSubjects } from '../features/content';
import type { TieredTopic, TopicUnlockStatus } from '../features/progression/progressionUtils';
import {
  AbyssDialog,
  AbyssDialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/abyss-dialog';
import { ParticlesAnimation, RITUAL_PARTICLE_ANIMATION } from './ui/particles-animation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTopicContentAvailabilityMap } from '@/hooks/useTopicContentAvailabilityMap';
import { scheduleTopicDetailsDismiss, TopicDetailsPopup } from './TopicDetailsPopup';
import { IncrementalSubjectModal } from './IncrementalSubjectModal';

interface DiscoveryModalProps {
  isOpen: boolean;
  unlockPoints: number;
  /** Deck due/total for active subject scope; shown inline with locked-topic summary. */
  dueCards?: number;
  totalCards?: number;
  getTopicUnlockStatus?: (ref: TopicRef, allGraphs?: SubjectGraph[]) => TopicUnlockStatus;
  onOpenRitual?: () => void;
  ritualCooldownRemainingMs?: number;
  onClose: () => void;
}

export function DiscoveryModal({
  isOpen,
  unlockPoints,
  dueCards,
  totalCards,
  getTopicUnlockStatus,
  onOpenRitual,
  ritualCooldownRemainingMs = 0,
  onClose,
}: DiscoveryModalProps) {
  /** Stable selection key; tier list + availability are derived fresh via `topicsByTier`. */
  const [selectedTopicKey, setSelectedTopicKey] = useState<{ subjectId: string; topicId: string } | null>(null);
  const [isNewSubjectOpen, setIsNewSubjectOpen] = useState(false);
  const isRitualSubmissionAvailable = ritualCooldownRemainingMs <= 0;

  useEffect(() => {
    if (!isOpen) {
      setSelectedTopicKey(null);
      setIsNewSubjectOpen(false);
    }
  }, [isOpen]);

  const getTopicsByTier = useStudyStore((state) => state.getTopicsByTier);
  const unlockTopic = useStudyStore((state) => state.unlockTopic);
  const storeGetTopicUnlockStatus = useStudyStore((state) => state.getTopicUnlockStatus);
  const allGraphs = useAllGraphs();
  const { data: subjects = [] } = useSubjects();
  const topicUnlockStatusGetter = useMemo(() => {
    return (ref: TopicRef) =>
      getTopicUnlockStatus
        ? getTopicUnlockStatus(ref, allGraphs)
        : storeGetTopicUnlockStatus(ref, allGraphs);
  }, [allGraphs, getTopicUnlockStatus, storeGetTopicUnlockStatus]);

  const subjectList = useMemo(() => subjects.map((subject) => ({ id: subject.id, name: subject.name })), [subjects]);

  const contentAvailabilityByTopicKey = useTopicContentAvailabilityMap();

  const topicsByTier = useMemo(() => {
    return getTopicsByTier(allGraphs, subjectList, undefined, contentAvailabilityByTopicKey);
  }, [getTopicsByTier, allGraphs, subjectList, contentAvailabilityByTopicKey]);

  const tiersWithVisibleTopics = useMemo(
    () => topicsByTier.filter((tierData) => tierData.topics.some((t) => t.isCurriculumVisible)),
    [topicsByTier],
  );

  const selectedTopic = useMemo((): TieredTopic | null => {
    if (!selectedTopicKey) {
      return null;
    }
    for (const tier of topicsByTier) {
      const found = tier.topics.find(
        (t) => t.id === selectedTopicKey.topicId && t.subjectId === selectedTopicKey.subjectId,
      );
      if (found) {
        return found;
      }
    }
    return null;
  }, [topicsByTier, selectedTopicKey]);

  useEffect(() => {
    if (selectedTopicKey && !selectedTopic) {
      setSelectedTopicKey(null);
    }
  }, [selectedTopicKey, selectedTopic]);

  const lockedTopicsCount = useMemo(() => {
    return topicsByTier.reduce((count, tierData) => {
      return (
        count +
        tierData.topics.filter((topic) => topic.isCurriculumVisible && topic.isLocked).length
      );
    }, 0);
  }, [topicsByTier]);

  const selectedTopicStatus = useMemo(() => {
    if (!selectedTopic) {
      return null;
    }
    return topicUnlockStatusGetter({ subjectId: selectedTopic.subjectId, topicId: selectedTopic.id });
  }, [selectedTopic, topicUnlockStatusGetter]);

  const handleUnlock = () => {
    if (!selectedTopic || !selectedTopicStatus?.canUnlock) {
      return;
    }

    unlockTopic({ subjectId: selectedTopic.subjectId, topicId: selectedTopic.id }, allGraphs);

    scheduleTopicDetailsDismiss(() => {
      setSelectedTopicKey(null);
      onClose();
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <AbyssDialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTopicKey(null);
            onClose();
          }
        }}
      >
        <AbyssDialogContent className="flex max-h-[95vh] flex-col">
          <DialogHeader>
            <DialogTitle>🏛️ Wisdom Altar</DialogTitle>
            <DialogDescription>Unlock topic crystals to expand your knowledge</DialogDescription>
            <p className="text-muted-foreground mt-1 text-xs">
              {lockedTopicsCount} locked topic{lockedTopicsCount !== 1 ? 's' : ''}
              {typeof dueCards === 'number' && typeof totalCards === 'number' ? (
                <>
                  {' '}
                  · {dueCards}/{totalCards} cards due
                </>
              ) : null}
            </p>
            <div className="mb-6 text-center">
              <div className="inline-flex flex-wrap items-center justify-center gap-3">
                <div className="inline-block rounded-full border border-border bg-secondary/40 px-6 py-2">
                  <span>
                    ✨ {unlockPoints} Unlock Point{unlockPoints !== 1 ? 's' : ''}
                  </span>
                </div>
                <Button
                  type="button"
                  onClick={() => setIsNewSubjectOpen(true)}
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent transition-colors"
                  aria-label="Generate new subject"
                  title="Generate new subject"
                >
                  <span className="relative z-10 text-lg leading-none text-foreground" aria-hidden="true">
                    🌱
                  </span>
                </Button>
                <Button
                  type="button"
                  onClick={() => onOpenRitual?.()}
                  className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                    isRitualSubmissionAvailable ? 'bg-accent' : 'bg-muted'
                  }`}
                  aria-label="Open attunement ritual"
                  title="Open attunement ritual"
                >
                  <span
                    className={`relative z-10 text-lg leading-none text-foreground ${
                      isRitualSubmissionAvailable ? 'animate-pulse' : ''
                    }`}
                    aria-hidden="true"
                  >
                    🧪
                  </span>
                  <ParticlesAnimation
                    isActive={isRitualSubmissionAvailable}
                    particles={RITUAL_PARTICLE_ANIMATION}
                  />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="-mx-4 overflow-y-auto px-4">
            <div className="space-y-6">
              {tiersWithVisibleTopics.map((tierData) => (
                <div key={tierData.tier}>
                  <div className="mb-3 flex items-center">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-muted-foreground px-4 text-sm font-semibold">
                      Tier {tierData.tier}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {tierData.topics
                      .filter((topic) => topic.isCurriculumVisible)
                      .map((topic) => (
                        <Button
                          key={`${topic.subjectId}:${topic.id}`}
                          type="button"
                          onClick={() =>
                            setSelectedTopicKey({ subjectId: topic.subjectId, topicId: topic.id })
                          }
                          multiline
                          variant="ghost"
                          className={`rounded-lg border p-4 text-left transition-all ${
                            topic.isLocked
                              ? 'border-border bg-muted/60 hover:border-muted-foreground/60'
                              : 'border-border/70 bg-secondary/30 hover:border-secondary'
                          }`}
                        >
                          <div className="flex w-full items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <h4
                                className={`truncate text-sm font-semibold ${
                                  topic.isLocked ? 'text-muted-foreground' : 'text-primary'
                                }`}
                              >
                                {topic.name}
                              </h4>
                              <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                                {topic.description}
                              </p>
                              <Badge
                                variant="outline"
                                className="mt-1.5 max-w-full truncate border-border/80 text-[0.6875rem] leading-tight font-normal text-muted-foreground"
                                title={topic.subjectName}
                              >
                                {topic.subjectName}
                              </Badge>
                              {!topic.isContentAvailable && (
                                <p className="text-accent-foreground mt-2 text-xs">
                                  📦 Content not available yet
                                </p>
                              )}
                            </div>
                            {topic.isLocked && (
                              <span className="text-muted-foreground ml-2 text-lg">🔒</span>
                            )}
                            {topic.isUnlocked && (
                              <span className="text-accent-foreground ml-2 text-lg">✅</span>
                            )}
                          </div>
                        </Button>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            {tiersWithVisibleTopics.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">No topics available</p>
              </div>
            )}
          </div>
        </AbyssDialogContent>
      </AbyssDialog>

      {selectedTopic && selectedTopicStatus && (
        <TopicDetailsPopup
          isOpen
          topic={selectedTopic}
          unlockStatus={selectedTopicStatus}
          onClose={() => setSelectedTopicKey(null)}
          onUnlock={handleUnlock}
        />
      )}

      <IncrementalSubjectModal
        isOpen={isNewSubjectOpen}
        onClose={() => setIsNewSubjectOpen(false)}
        onEnqueued={() => {
          setIsNewSubjectOpen(false);
          onClose();
        }}
      />
    </>
  );
}

export default DiscoveryModal;
