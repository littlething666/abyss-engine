import React, { useEffect, useMemo, useState } from 'react';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { useAllGraphs, useSubjects } from '../features/content';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ParticlesAnimation, RITUAL_PARTICLE_ANIMATION } from './ui/particles-animation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Radix controlled Dialog: if we unmount the details layer synchronously inside
 * onOpenChange(false) (or right after Close), dismiss handling can still reach the
 * sibling Wisdom Altar dialog. Deferring one macrotask lets the inner dialog finish
 * closing first (same effect as setTimeout(..., 0) in app code).
 */
function scheduleDetailsDismiss(onDismiss: () => void) {
  window.setTimeout(onDismiss, 0);
}

// ============================================================================
// Types
// ============================================================================

interface TopicTierData {
  tier: number;
  topics: {
    id: string;
    name: string;
    description: string;
    subjectId: string;
    subjectName: string;
    isContentAvailable: boolean;
    isLocked: boolean;
    isUnlocked: boolean;
  }[];
}

interface UnlockStatus {
  canUnlock: boolean;
  hasPrerequisites: boolean;
  hasEnoughPoints: boolean;
  missingPrerequisites: {
    topicId: string;
    topicName: string;
    requiredLevel: number;
    currentLevel: number;
  }[];
}

interface DiscoveryModalProps {
  isOpen: boolean;
  unlockPoints: number;
  /** Deck due/total for active subject scope; shown inline with locked-topic summary. */
  dueCards?: number;
  totalCards?: number;
  getTopicUnlockStatus?: (topicId: string, allGraphs?: unknown[]) => UnlockStatus;
  onOpenRitual?: () => void;
  ritualCooldownRemainingMs?: number;
  onClose: () => void;
}

// ============================================================================
// Details Popup Component
// ============================================================================

interface DetailsPopupProps {
  topic: TopicTierData['topics'][0];
  unlockStatus: UnlockStatus;
  isOpen: boolean;
  onClose: () => void;
  onUnlock: () => void;
  isContentAvailable: boolean;
}

const DetailsPopup: React.FC<DetailsPopupProps> = ({
  topic,
  unlockStatus,
  isOpen,
  onClose,
  onUnlock,
  isContentAvailable,
}) => {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          scheduleDetailsDismiss(onClose);
        }
      }}
    >
      <DialogContent
        className="w-[min(95%,30rem)] max-h-[95vh] bg-card border border-border shadow-2xl rounded-[20px] overflow-hidden p-3 sm:p-6 flex flex-col min-h-0"
      >
      <DialogHeader>
        <DialogTitle>{topic.name}</DialogTitle>
        <DialogDescription>
          {topic.subjectName}
        </DialogDescription>
      </DialogHeader>
      <div className="overflow-y-auto">
        {/* Description */}
        <p className="text-muted-foreground text-sm mb-4">{topic.description}</p>

        {!isContentAvailable && (
          <p className="text-accent-foreground text-sm font-semibold mb-3">
            📦 Content not available yet
          </p>
        )}

        {/* Status / Requirements */}
        {topic.isLocked && (
          <div className="mb-4 space-y-2">
            {unlockStatus.hasPrerequisites ? (
              <div className="bg-accent/10 border border-accent rounded-lg p-3">
                <Badge variant="secondary" className="mb-2">
                  ✅ Prerequisites Met
                </Badge>
                <div className="text-muted-foreground text-sm">
                  Cost: 1 Unlock Point
                </div>
              </div>
            ) : (
                <div className="bg-destructive/10 border border-destructive rounded-lg p-3">
                <Badge variant="destructive" className="mb-2">
                  🔒 Requires Prerequisites
                </Badge>
                {unlockStatus.missingPrerequisites.map((prereq, idx) => (
                  <div key={idx} className="text-destructive text-sm">
                    • {prereq.topicName} Level {prereq.requiredLevel} (Current: Level {prereq.currentLevel})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Unlock Button */}
        {topic.isLocked && (
          <Button
            onClick={onUnlock}
            disabled={!unlockStatus.canUnlock || !isContentAvailable}
            className={`w-full py-3 px-6 rounded-lg font-semibold border-none cursor-pointer transition-all ${
              unlockStatus.canUnlock && isContentAvailable
                ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
            }`}
          >
            {isContentAvailable
              ? (unlockStatus.canUnlock ? '🔓 Unlock & Spawn' : '🔒 Locked')
              : '📦 Content Not Available'}
          </Button>
        )}

        {/* Already Unlocked Message */}
        {topic.isUnlocked && (
          <div className="text-center text-muted-foreground text-sm">
            ✅ This topic is already unlocked
          </div>
        )}
      </div>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================================
// Discovery Modal (Tiered Skill Tree)
// ============================================================================

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
  const [selectedTopic, setSelectedTopic] = useState<TopicTierData['topics'][0] | null>(null);
  const isRitualSubmissionAvailable = ritualCooldownRemainingMs <= 0;

  useEffect(() => {
    if (!isOpen) {
      setSelectedTopic(null);
    }
  }, [isOpen]);

  // Get store actions
  const getTopicsByTier = useStudyStore((state) => state.getTopicsByTier);
  const unlockTopic = useStudyStore((state) => state.unlockTopic);
  const unlockedTopicIds = useStudyStore((state) => state.unlockedTopicIds);
  const storeGetTopicUnlockStatus = useStudyStore((state) => state.getTopicUnlockStatus);
  const allGraphs = useAllGraphs();
  const { data: subjects = [] } = useSubjects();
  const topicUnlockStatusGetter = useMemo(() => {
    return (topicId: string) =>
      getTopicUnlockStatus
        ? getTopicUnlockStatus(topicId, allGraphs)
        : storeGetTopicUnlockStatus(topicId, allGraphs);
  }, [allGraphs, getTopicUnlockStatus, storeGetTopicUnlockStatus]);

  const subjectList = useMemo(() => subjects.map((subject) => ({ id: subject.id, name: subject.name })), [subjects]);

  // Get topics grouped by tier
  const topicsByTier = useMemo(() => {
    return getTopicsByTier(allGraphs, unlockedTopicIds, subjectList);
  }, [getTopicsByTier, unlockPoints, unlockedTopicIds, allGraphs, subjectList]);

  const lockedTopicsCount = useMemo(() => {
    return topicsByTier.reduce((count, tierData) => {
      return count + tierData.topics.filter((topic) => topic.isLocked).length;
    }, 0);
  }, [topicsByTier]);

  // Get unlock status for selected topic
  const selectedTopicStatus = useMemo(() => {
    if (!selectedTopic) return null;
    return topicUnlockStatusGetter(selectedTopic.id);
  }, [selectedTopic, topicUnlockStatusGetter]);

  // Handle unlock click
  const handleUnlock = () => {
    if (!selectedTopic || !selectedTopicStatus?.canUnlock) return;

    // Unlock the topic
    const position = unlockTopic(selectedTopic.id, allGraphs);
    if (position) {
      console.log(`Unlocked ${selectedTopic.name} at position [${position[0]}, ${position[1]}]`);
    }

    scheduleDetailsDismiss(() => {
      setSelectedTopic(null);
      onClose();
    });
  };

  if (!isOpen) return null;

  return (
    <>
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setSelectedTopic(null);
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-h-[95vh] flex flex-col"
      >
        <DialogHeader>
          <DialogTitle>🏛️ Wisdom Altar</DialogTitle>
          <DialogDescription>
            Unlock topic crystals to expand your knowledge
          </DialogDescription>
          <p className="text-muted-foreground mt-1 text-xs">
            {lockedTopicsCount} locked topic{lockedTopicsCount !== 1 ? 's' : ''}
            {typeof dueCards === 'number' && typeof totalCards === 'number' ? (
              <>
                {' '}
                · {dueCards}/{totalCards} cards due
              </>
            ) : null}
          </p>
          <div className="text-center mb-6">
            <div className="inline-flex flex-wrap items-center justify-center gap-3">
              <div className="inline-block bg-secondary/40 border border-border rounded-full py-2 px-6">
                <span>
                  ✨ {unlockPoints} Unlock Point{unlockPoints !== 1 ? 's' : ''}
                </span>
              </div>
              <Button
                type="button"
                onClick={() => onOpenRitual?.()}
                className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors ${isRitualSubmissionAvailable ? 'bg-accent' : 'bg-muted'
                  }`}
                aria-label="Open attunement ritual"
                title="Open attunement ritual"
              >
                <span
                  className={`relative z-10 text-lg leading-none text-foreground ${isRitualSubmissionAvailable ? 'animate-pulse' : ''
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
        <div className="-mx-4 overflow-y-auto px-4 no-scrollbar">
            {/* Tiered Grid Layout */}
            <div className="space-y-6">
              {topicsByTier.map((tierData) => (
                <div key={tierData.tier}>
                  {/* Tier Label */}
                  <div className="flex items-center mb-3">
                    <div className="flex-1 h-px bg-border"></div>
                    <span className="px-4 text-muted-foreground text-sm font-semibold">
                      Tier {tierData.tier}
                    </span>
                    <div className="flex-1 h-px bg-border"></div>
                  </div>

                  {/* Topics in this tier */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {tierData.topics.map((topic) => (
                      <Button
                        key={topic.id}
                        onClick={() => setSelectedTopic(topic)}
                        multiline
                        variant="ghost"
                        className={`text-left p-4 rounded-lg border transition-all ${
                          topic.isLocked
                            ? 'bg-muted/60 border-border hover:border-muted-foreground/60'
                            : 'bg-secondary/30 border-border/70 hover:border-secondary'
                        }`}
                      >
                        <div className="flex items-start justify-between w-full">
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-semibold text-sm truncate ${
                              topic.isLocked ? 'text-muted-foreground' : 'text-primary'
                            }`}>
                              {topic.name}
                            </h4>
                            <p className={`text-xs mt-1 line-clamp-2 ${
                              topic.isLocked ? 'text-muted-foreground' : 'text-muted-foreground'
                            }`}>
                              {topic.description}
                            </p>
                            <Badge
                              variant="outline"
                              className="mt-1.5 max-w-full truncate font-normal text-[0.6875rem] leading-tight border-border/80 text-muted-foreground"
                              title={topic.subjectName}
                            >
                              {topic.subjectName}
                            </Badge>
                            {!topic.isContentAvailable && (
                              <p className="mt-2 text-accent-foreground text-xs">
                                📦 Content not available yet
                              </p>
                            )}
                          </div>
                          {topic.isLocked && (
                            <span className="text-muted-foreground text-lg ml-2">🔒</span>
                          )}
                          {topic.isUnlocked && (
                            <span className="text-accent-foreground text-lg ml-2">✅</span>
                          )}
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Empty state if no topics */}
            {topicsByTier.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No topics available</p>
              </div>
            )}
          </div>
      </DialogContent>
    </Dialog>

    {selectedTopic && selectedTopicStatus && (
      <DetailsPopup
        isOpen
        topic={selectedTopic}
        unlockStatus={selectedTopicStatus}
        onClose={() => setSelectedTopic(null)}
        onUnlock={handleUnlock}
        isContentAvailable={selectedTopic.isContentAvailable}
      />
    )}
    </>
  );
}

export default DiscoveryModal;
