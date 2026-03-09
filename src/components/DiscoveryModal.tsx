import React, { useState, useMemo } from 'react';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { useAllGraphs, useSubjects } from '../features/content';
import { ModalWrapper } from './ui/modal-wrapper';

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
  lockedTopicsCount: number;
  unlockPoints: number;
  getTopicUnlockStatus?: (topicId: string, allGraphs?: unknown[]) => UnlockStatus;
  onClose: () => void;
}

// ============================================================================
// Details Popup Component
// ============================================================================

interface DetailsPopupProps {
  topic: TopicTierData['topics'][0];
  unlockStatus: UnlockStatus;
  onClose: () => void;
  onUnlock: () => void;
  isContentAvailable: boolean;
}

const DetailsPopup: React.FC<DetailsPopupProps> = ({
  topic,
  unlockStatus,
  onClose,
  onUnlock,
  isContentAvailable,
}) => {
  return (
    <ModalWrapper
      onClose={onClose}
      overlayClassName="bg-black/60 z-[200]"
      panelClassName="w-[min(95%,30rem)] border-slate-600 shadow-2xl"
    >
      <div className="overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-bold text-slate-200 m-0">{topic.name}</h3>
            <p className="text-cyan-400 text-sm mt-1">{topic.subjectName}</p>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-slate-400 text-xl cursor-pointer p-1 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Description */}
        <p className="text-slate-300 text-sm mb-4">{topic.description}</p>

        {!isContentAvailable && (
          <p className="text-amber-400 text-sm font-semibold mb-3">
            📦 Content not available yet
          </p>
        )}

        {/* Status / Requirements */}
        {topic.isLocked && (
          <div className="mb-4">
            {unlockStatus.hasPrerequisites ? (
              <div className="bg-emerald-900/30 border border-emerald-500 rounded-lg p-3">
                <div className="text-emerald-400 text-sm font-semibold mb-1">
                  ✅ Prerequisites Met
                </div>
                <div className="text-emerald-300/70 text-sm">
                  Cost: 1 Unlock Point
                </div>
              </div>
            ) : (
              <div className="bg-red-900/30 border border-red-500 rounded-lg p-3">
                <div className="text-red-400 text-sm font-semibold mb-2">
                  🔒 Requires Prerequisites
                </div>
                {unlockStatus.missingPrerequisites.map((prereq, idx) => (
                  <div key={idx} className="text-red-300/70 text-sm">
                    • {prereq.topicName} Level {prereq.requiredLevel} (Current: Level {prereq.currentLevel})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Unlock Button */}
        {topic.isLocked && (
          <button
            onClick={onUnlock}
            disabled={!unlockStatus.canUnlock || !isContentAvailable}
            className={`w-full py-3 px-6 rounded-lg font-semibold text-white border-none cursor-pointer transition-all ${
              unlockStatus.canUnlock && isContentAvailable
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-slate-600 cursor-not-allowed opacity-50'
            }`}
          >
            {isContentAvailable
              ? (unlockStatus.canUnlock ? '🔓 Unlock & Spawn' : '🔒 Locked')
              : '📦 Content Not Available'}
          </button>
        )}

        {/* Already Unlocked Message */}
        {topic.isUnlocked && (
          <div className="text-center text-slate-400 text-sm">
            ✅ This topic is already unlocked
          </div>
        )}
      </div>
    </ModalWrapper>
  );
};

// ============================================================================
// Discovery Modal (Tiered Skill Tree)
// ============================================================================

export function DiscoveryModal({
  isOpen,
  lockedTopicsCount,
  unlockPoints,
  getTopicUnlockStatus,
  onClose,
}: DiscoveryModalProps) {
  const [selectedTopic, setSelectedTopic] = useState<TopicTierData['topics'][0] | null>(null);

  // Get store actions
  const getTopicsByTier = useStudyStore((state) => state.getTopicsByTier);
  const unlockTopic = useStudyStore((state) => state.unlockTopic);
  const lockedTopics = useStudyStore((state) => state.lockedTopics);
  const unlockedTopicIds = useStudyStore((state) => state.unlockedTopicIds);
  const storeGetTopicUnlockStatus = useStudyStore((state) => state.getTopicUnlockStatus);
  const allGraphs = useAllGraphs();
  const { data: subjects = [] } = useSubjects();
  const topicUnlockStatusGetter = React.useMemo(() => {
    return (topicId: string) =>
      getTopicUnlockStatus
        ? getTopicUnlockStatus(topicId, allGraphs)
        : storeGetTopicUnlockStatus(topicId, allGraphs);
  }, [allGraphs, getTopicUnlockStatus, storeGetTopicUnlockStatus]);

  const subjectList = useMemo(() => subjects.map((subject) => ({ id: subject.id, name: subject.name })), [subjects]);

  // Get topics grouped by tier
  const topicsByTier = useMemo(() => {
    return getTopicsByTier(allGraphs, unlockedTopicIds, subjectList);
  }, [getTopicsByTier, unlockPoints, lockedTopics, unlockedTopicIds, allGraphs, subjectList]);

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

    // Close the popup and the modal
    setSelectedTopic(null);
    onClose();
  };

  // Handle escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <ModalWrapper
        onClose={onClose}
        panelClassName="w-[min(95%,56rem)]"
      >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 bg-transparent border-none text-slate-400 text-2xl cursor-pointer leading-none p-1 hover:text-slate-200 transition-colors z-30"
            aria-label="Close modal"
          >
            ✕
          </button>

          <div className="sticky top-0 z-20 bg-slate-800">
            {/* Header */}
            <header className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-slate-200 m-0">🏛️ Wisdom Altar</h2>
              <p className="text-slate-400 mt-1.5 text-sm">
                Unlock topic crystals to expand your knowledge
              </p>
              <p className="text-slate-500 mt-1 text-xs">
                {lockedTopicsCount} locked topic{lockedTopicsCount !== 1 ? 's' : ''}
              </p>
            </header>

            {/* Unlock Points Display */}
            <div className="text-center mb-6">
              <div className="inline-block bg-amber-900/40 border border-amber-500 rounded-full py-2 px-6">
                <span className="text-amber-400 font-bold text-lg">
                  ✨ {unlockPoints} Unlock Point{unlockPoints !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-2">
            {/* Tiered Grid Layout */}
            <div className="space-y-6">
              {topicsByTier.map((tierData) => (
                <div key={tierData.tier}>
                  {/* Tier Label */}
                  <div className="flex items-center mb-3">
                    <div className="flex-1 h-px bg-slate-600"></div>
                    <span className="px-4 text-slate-400 text-sm font-semibold">
                      Tier {tierData.tier}
                    </span>
                    <div className="flex-1 h-px bg-slate-600"></div>
                  </div>

                  {/* Topics in this tier */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {tierData.topics.map((topic) => (
                      <button
                        key={topic.id}
                        onClick={() => setSelectedTopic(topic)}
                        className={`text-left p-4 rounded-lg border transition-all ${
                          topic.isLocked
                            ? 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
                            : 'bg-cyan-900/30 border-cyan-500/50 hover:border-cyan-400'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-semibold text-sm truncate ${
                              topic.isLocked ? 'text-slate-400' : 'text-cyan-400'
                            }`}>
                              {topic.name}
                            </h4>
                            <p className={`text-xs mt-1 line-clamp-2 ${
                              topic.isLocked ? 'text-slate-500' : 'text-slate-400'
                            }`}>
                              {topic.description}
                            </p>
                            {!topic.isContentAvailable && (
                              <p className="mt-2 text-amber-400 text-xs">
                                📦 Content not available yet
                              </p>
                            )}
                          </div>
                          {topic.isLocked && (
                            <span className="text-slate-500 text-lg ml-2">🔒</span>
                          )}
                          {topic.isUnlocked && (
                            <span className="text-emerald-400 text-lg ml-2">✅</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Empty state if no topics */}
            {topicsByTier.length === 0 && (
              <div className="text-center py-8">
                <p className="text-slate-400">No topics available</p>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-20 bg-slate-800 pt-3 pb-1 text-center">
            <button
              onClick={onClose}
              className="text-slate-200 bg-slate-700 border-none px-6 py-2 rounded-md cursor-pointer hover:bg-slate-600"
            >
              Close
            </button>
          </div>
      </ModalWrapper>

      {/* Details Popup */}
      {selectedTopic && selectedTopicStatus && (
        <DetailsPopup
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
