import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SubjectGraph, TopicRef } from '@/types/core';
import { DEFAULT_CRYSTAL_BASE_SHAPE } from '@/types/core';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { useAllGraphs, useSubjects } from '../features/content';
import { useFeatureFlagsStore } from '@/store/featureFlagsStore';
import type { TieredTopic, TopicUnlockStatus } from '../features/progression/progressionUtils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KeyRound, List, Lock, Unlock } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { InfoPopover } from '@/components/InfoPopover';
import { useTopicContentStatusMap } from '@/hooks/useTopicContentStatusMap';
import { topicRefKey } from '@/lib/topicRef';
import { triggerTopicGenerationPipeline } from '@/features/contentGeneration';
import { useContentGenerationStore } from '@/features/contentGeneration/contentGenerationStore';
import type { ContentGenerationJobKind } from '@/types/contentGeneration';
import { TopicDetailsPopup } from './TopicDetailsPopup';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '@/store/uiStore';

const DISCOVERY_MODAL_SUBJECT_STORAGE_KEY = 'abyss:discoveryModalSubjectId';

const TOPIC_TIER_SORT_KINDS = new Set<ContentGenerationJobKind>([
  'topic-theory',
  'topic-study-cards',
  'topic-mini-games',
  'topic-expansion-cards',
]);

/** Sits beside the filter icon (no overlap) — keep compact for the toggle row. */
const FILTER_COUNT_BADGE_CLASS =
  'pointer-events-none inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border border-border px-1 py-0 font-medium text-[10px] tabular-nums leading-none';

type TopicListFilter = 'all' | 'locked' | 'unlocked';

function makeSubjectSwatchStyle(color: string | undefined): React.CSSProperties {
  return { backgroundColor: color ?? 'transparent' };
}

function matchesTopicListFilter(topic: TieredTopic, filter: TopicListFilter): boolean {
  if (!topic.isCurriculumVisible) return false;
  if (filter === 'locked') return topic.isLocked;
  if (filter === 'unlocked') return topic.isUnlocked && topic.contentStatus === 'ready';
  return true;
}

/** Generating first, then other unlocked crystals, then locked (used for all filter modes). */
function discoveryTopicActivityBand(topic: TieredTopic): number {
  if (topic.contentStatus === 'generating') return 2;
  if (topic.isUnlocked) return 1;
  return 0;
}

function sortDiscoveryTierTopics(
  topics: TieredTopic[],
  maxFinishedAtByTopicKey: Record<string, number>,
): TieredTopic[] {
  return [...topics].sort((a, b) => {
    const bandA = discoveryTopicActivityBand(a);
    const bandB = discoveryTopicActivityBand(b);
    if (bandA !== bandB) return bandB - bandA;
    const ka = topicRefKey({ subjectId: a.subjectId, topicId: a.id });
    const kb = topicRefKey({ subjectId: b.subjectId, topicId: b.id });
    const fa = maxFinishedAtByTopicKey[ka] ?? 0;
    const fb = maxFinishedAtByTopicKey[kb] ?? 0;
    if (fa !== fb) return fb - fa;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/**
 * Buckets tier topics by subject. Subject order follows manifest `subjects` in descending order
 * (newest-first index); unknown subjects last, then by name descending.
 */
function groupTopicsBySubjectInManifestOrder(
  topics: TieredTopic[],
  subjectOrderRank: Map<string, number>,
): { subjectId: string; subjectName: string; topics: TieredTopic[] }[] {
  const byId = new Map<string, { subjectId: string; subjectName: string; topics: TieredTopic[] }>();
  for (const topic of topics) {
    let group = byId.get(topic.subjectId);
    if (!group) {
      group = { subjectId: topic.subjectId, subjectName: topic.subjectName, topics: [] };
      byId.set(topic.subjectId, group);
    }
    group.topics.push(topic);
  }
  const subjectIds = [...byId.keys()];
  subjectIds.sort((a, b) => {
    const ra = subjectOrderRank.get(a);
    const rb = subjectOrderRank.get(b);
    if (ra !== undefined && rb !== undefined && ra !== rb) return rb - ra;
    if (ra !== undefined && rb === undefined) return -1;
    if (ra === undefined && rb !== undefined) return 1;
    const na = byId.get(a)!.subjectName;
    const nb = byId.get(b)!.subjectName;
    return nb.localeCompare(na, undefined, { sensitivity: 'base' });
  });
  return subjectIds.map((id) => byId.get(id)!);
}

function readStoredModalSubjectId(): string {
  if (typeof window === 'undefined') return '__all_floors__';
  try {
    const raw = window.sessionStorage.getItem(DISCOVERY_MODAL_SUBJECT_STORAGE_KEY);
    return raw && raw.length > 0 ? raw : '__all_floors__';
  } catch {
    return '__all_floors__';
  }
}

function writeStoredModalSubjectId(subjectId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DISCOVERY_MODAL_SUBJECT_STORAGE_KEY, subjectId);
  } catch {
    // ignore quota / private mode
  }
}

function DiscoveryTopicTile({
  topic,
  onSelect,
}: {
  topic: TieredTopic;
  onSelect: (topic: TieredTopic) => void;
}) {
  return (
    <Button
      type="button"
      onClick={() => onSelect(topic)}
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
          <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{topic.description}</p>
          {topic.contentStatus === 'generating' && (
            <p className="text-primary mt-2 text-xs">⏳ Generating…</p>
          )}
          {topic.contentStatus === 'unavailable' && (
            <p className="text-accent-foreground mt-2 text-xs">📦 Content not available yet</p>
          )}
        </div>
        {topic.isLocked && <span className="text-muted-foreground ml-2 text-lg">🔒</span>}
        {topic.isUnlocked && <span className="text-accent-foreground ml-2 text-lg">✅</span>}
      </div>
    </Button>
  );
}

interface DiscoveryModalProps {
  isOpen: boolean;
  unlockPoints: number;
  getTopicUnlockStatus?: (ref: TopicRef, allGraphs?: SubjectGraph[]) => TopicUnlockStatus;
  onOpenRitual?: () => void;
  ritualCooldownRemainingMs?: number;
  onClose: () => void;
  /**
   * Called by the empty-state CTA when the user has no subjects yet and clicks
   * "New subject". The handler should close Discovery before opening the
   * incremental-subject creation modal so the two surfaces never stack.
   */
  onCreateSubject?: () => void;
}

export function DiscoveryModal({
  isOpen,
  unlockPoints,
  getTopicUnlockStatus,
  onOpenRitual,
  ritualCooldownRemainingMs = 0,
  onClose,
  onCreateSubject,
}: DiscoveryModalProps) {
  const [selectedTopicKey, setSelectedTopicKey] = useState<{ subjectId: string; topicId: string } | null>(null);
  const [topicListFilter, setTopicListFilter] = useState<TopicListFilter>('locked');
  const [modalSubjectId, setModalSubjectId] = useState<string>(readStoredModalSubjectId);
  const isRitualSubmissionAvailable = ritualCooldownRemainingMs <= 0;
  const ritualVisible = useFeatureFlagsStore((s) => s.ritualVisible);

  // UI-store-supplied scope hint. When non-null at open time it wins over
  // the sessionStorage default so the mentor's open_discovery effect can
  // pre-filter the modal to a specific subject.
  const uiStoreSubjectIdHint = useUIStore((s) => s.discoveryModalSubjectId);

  const modalSubjectScopeForGraphs = modalSubjectId === '__all_floors__' ? null : modalSubjectId;

  useEffect(() => {
    if (!isOpen) {
      setSelectedTopicKey(null);
      setTopicListFilter('locked');
    }
  }, [isOpen]);

  // When the modal opens with a uiStore-supplied scope hint, adopt it as the
  // current scope and persist to sessionStorage so subsequent unscoped opens
  // remember it. Re-runs if the hint changes while the modal is already open.
  useEffect(() => {
    if (!isOpen) return;
    if (uiStoreSubjectIdHint === null || uiStoreSubjectIdHint === undefined) return;
    setModalSubjectId(uiStoreSubjectIdHint);
    writeStoredModalSubjectId(uiStoreSubjectIdHint);
  }, [isOpen, uiStoreSubjectIdHint]);

  const getTopicsByTier = useStudyStore((state) => state.getTopicsByTier);
  const unlockTopic = useStudyStore((state) => state.unlockTopic);
  const storeGetTopicUnlockStatus = useStudyStore((state) => state.getTopicUnlockStatus);
  const allGraphs = useAllGraphs();
  const { data: subjects = [] } = useSubjects();
  const jobs = useContentGenerationStore(useShallow((state) => state.jobs));

  const topicUnlockStatusGetter = useMemo(() => {
    return (ref: TopicRef) =>
      getTopicUnlockStatus
        ? getTopicUnlockStatus(ref, allGraphs)
        : storeGetTopicUnlockStatus(ref, allGraphs);
  }, [allGraphs, getTopicUnlockStatus, storeGetTopicUnlockStatus]);

  const subjectList = useMemo(() => subjects.map((subject) => ({ id: subject.id, name: subject.name })), [subjects]);

  const subjectOrderRank = useMemo(() => {
    const m = new Map<string, number>();
    subjects.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [subjects]);

  const contentStatusMap = useTopicContentStatusMap();

  const topicsByTier = useMemo(() => {
    return getTopicsByTier(allGraphs, subjectList, modalSubjectScopeForGraphs, contentStatusMap);
  }, [getTopicsByTier, allGraphs, subjectList, modalSubjectScopeForGraphs, contentStatusMap]);

  useEffect(() => {
    if (modalSubjectId === '__all_floors__') return;
    const exists = subjects.some((s) => s.id === modalSubjectId);
    if (!exists) {
      setModalSubjectId('__all_floors__');
      writeStoredModalSubjectId('__all_floors__');
    }
  }, [subjects, modalSubjectId]);

  const topicFilterCounts = useMemo(() => {
    const visible = topicsByTier.flatMap((t) => t.topics).filter((topic) => topic.isCurriculumVisible);
    return {
      locked: visible.filter((t) => t.isLocked).length,
      unlocked: visible.filter((t) => t.isUnlocked && t.contentStatus === 'ready').length,
      all: visible.length,
    };
  }, [topicsByTier]);

  const maxFinishedAtByTopicKey = useMemo(() => {
    const map: Record<string, number> = {};
    for (const job of Object.values(jobs)) {
      if (!job.subjectId || !job.topicId) continue;
      if (!TOPIC_TIER_SORT_KINDS.has(job.kind)) continue;
      if (job.status !== 'completed' || job.finishedAt == null) continue;
      const k = topicRefKey({ subjectId: job.subjectId, topicId: job.topicId });
      map[k] = Math.max(map[k] ?? 0, job.finishedAt);
    }
    return map;
  }, [jobs]);

  const displayTiers = useMemo(() => {
    const out: { tier: number; topics: TieredTopic[] }[] = [];
    for (const tierData of topicsByTier) {
      const filtered = tierData.topics.filter((t) => matchesTopicListFilter(t, topicListFilter));
      const sorted = sortDiscoveryTierTopics(filtered, maxFinishedAtByTopicKey);
      if (sorted.length > 0) {
        out.push({ tier: tierData.tier, topics: sorted });
      }
    }
    return out;
  }, [topicsByTier, topicListFilter, maxFinishedAtByTopicKey]);

  const selectedTopic = useMemo((): TieredTopic | null => {
    if (!selectedTopicKey) return null;
    for (const tier of topicsByTier) {
      const found = tier.topics.find(
        (t) => t.id === selectedTopicKey.topicId && t.subjectId === selectedTopicKey.subjectId,
      );
      if (found) return found;
    }
    return null;
  }, [topicsByTier, selectedTopicKey]);

  useEffect(() => {
    if (selectedTopicKey && !selectedTopic) {
      setSelectedTopicKey(null);
    }
  }, [selectedTopicKey, selectedTopic]);

  const selectedTopicStatus = useMemo(() => {
    if (!selectedTopic) return null;
    return topicUnlockStatusGetter({ subjectId: selectedTopic.subjectId, topicId: selectedTopic.id });
  }, [selectedTopic, topicUnlockStatusGetter]);

  const subjectSelectItems = useMemo(() => {
    const allItem = {
      value: '__all_floors__',
      label: (
        <span className="flex w-full items-center gap-2">
          <span className="size-2 shrink-0 rounded-sm bg-muted" aria-hidden />
          <span>All subjects</span>
        </span>
      ),
    };
    const subjectItems = [...subjects].toReversed().map((subject) => {
      const swatchStyle = makeSubjectSwatchStyle(subject.color);
      return {
        value: subject.id,
        label: (
          <span className="flex w-full min-w-0 items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-sm border border-border/60"
              style={swatchStyle}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{subject.name}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
              {subject.geometry.gridTile}/{subject.crystalBaseShape ?? DEFAULT_CRYSTAL_BASE_SHAPE}
            </span>
          </span>
        ),
      };
    });
    return [allItem, ...subjectItems];
  }, [subjects]);

  const handleSelectSubject = useCallback((subjectId: string | null) => {
    const next = subjectId === null || subjectId === '__all_floors__' ? '__all_floors__' : subjectId;
    setModalSubjectId(next);
    writeStoredModalSubjectId(next);
  }, []);

  const handleResetFilters = useCallback(() => {
    setTopicListFilter('all');
    setModalSubjectId('__all_floors__');
    writeStoredModalSubjectId('__all_floors__');
  }, []);

  const handlePickTopic = useCallback((topic: TieredTopic) => {
    setSelectedTopicKey({ subjectId: topic.subjectId, topicId: topic.id });
  }, []);

  const handleCreateSubjectClick = useCallback(() => {
    onCreateSubject?.();
  }, [onCreateSubject]);

  const handleUnlock = () => {
    if (!selectedTopic || !selectedTopicStatus?.canUnlock) return;
    const ref = { subjectId: selectedTopic.subjectId, topicId: selectedTopic.id };
    unlockTopic(ref, allGraphs);
    const tKey = topicRefKey(ref);
    const status = contentStatusMap[tKey];
    if (status !== 'ready') {
      triggerTopicGenerationPipeline(ref.subjectId, ref.topicId, { stage: 'full' });
    }
    setSelectedTopicKey(null);
    onClose();
  };

  const showSubjectGroups = modalSubjectId === '__all_floors__';
  const hasNoSubjects = subjects.length === 0;

  if (!isOpen) return null;

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedTopicKey(null);
      onClose();
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="flex max-h-[95vh] min-h-0 flex-col">
          <DialogHeader className="shrink-0 space-y-3 pb-0">
            <DialogTitle>🏛️ Wisdom Altar</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-1">
              <span className="min-w-0">Spend keys to unlock topic crystals, tier by tier.</span>
              <Badge
                variant="ghost"
                className="mx-1 h-7 shrink-0 gap-1.5 rounded-full border border-border/80 px-2 py-0 text-xs tabular-nums shadow-none"
                title="Unlock points"
              >
                <KeyRound className="size-3.5 opacity-80" aria-hidden />
                {unlockPoints}
              </Badge>
              <InfoPopover label="About unlocking topics">
                <p>
                  Unlocking a topic costs keys (earned by reviewing cards and completing rituals) and triggers
                  content generation; higher tiers unlock after their prerequisites.
                </p>
              </InfoPopover>
            </DialogDescription>
            {ritualVisible ? (
              <div className="flex min-h-9 min-w-0 items-center justify-between gap-3 overflow-x-auto pt-1 [scrollbar-width:thin]">
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={isRitualSubmissionAvailable ? 'outline' : 'secondary'}
                    onClick={() => onOpenRitual?.()}
                    className="relative h-9 gap-1.5 overflow-hidden px-3"
                    aria-label="Open attunement ritual"
                  >
                    <span
                      className={`relative z-10 text-base leading-none ${
                        isRitualSubmissionAvailable ? 'animate-pulse' : ''
                      }`}
                      aria-hidden
                    >
                      🧪
                    </span>
                    <span className="text-sm font-medium">Ritual</span>
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogHeader>

          <div className="mt-3 flex min-w-0 shrink-0 flex-row items-center gap-2 overflow-x-auto border-t border-border pt-3 [scrollbar-width:thin]">
            <Select
              modal={false}
              items={subjectSelectItems}
              value={modalSubjectId}
              onValueChange={handleSelectSubject}
            >
              <SelectTrigger size="sm" className="min-w-0 max-w-xs flex-1 shrink" aria-label="Subject">
                <SelectValue placeholder="All subjects" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {subjectSelectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <ToggleGroup
              value={[topicListFilter]}
              onValueChange={(values) => {
                const next = values[0] as TopicListFilter | undefined;
                if (next) setTopicListFilter(next);
              }}
              variant="outline"
              size="sm"
              spacing={0}
              className="shrink-0"
            >
              <ToggleGroupItem
                value="all"
                className="relative h-9 min-w-10 justify-center gap-1 px-1"
                aria-label={`All topics, ${topicFilterCounts.all}`}
                title={`All topics (${topicFilterCounts.all})`}
              >
                <List className="size-4 shrink-0" aria-hidden />
                <Badge variant="secondary" className={FILTER_COUNT_BADGE_CLASS}>
                  {topicFilterCounts.all}
                </Badge>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="locked"
                className="relative h-9 min-w-10 justify-center gap-1.5 px-2"
                aria-label={`Locked topics, ${topicFilterCounts.locked}`}
                title={`Locked topics (${topicFilterCounts.locked})`}
              >
                <Lock className="size-4 shrink-0" aria-hidden />
                <Badge variant="secondary" className={FILTER_COUNT_BADGE_CLASS}>
                  {topicFilterCounts.locked}
                </Badge>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="unlocked"
                className="relative h-9 min-w-10 justify-center gap-1.5 px-2"
                aria-label={`Unlocked topics, ${topicFilterCounts.unlocked}`}
                title={`Unlocked topics (${topicFilterCounts.unlocked})`}
              >
                <Unlock className="size-4 shrink-0" aria-hidden />
                <Badge variant="secondary" className={FILTER_COUNT_BADGE_CLASS}>
                  {topicFilterCounts.unlocked}
                </Badge>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="-mx-4 mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
            {displayTiers.length === 0 ? (
              hasNoSubjects ? (
                <Empty
                  className="my-6 min-h-[12rem] border border-dashed"
                  data-testid="discovery-empty-no-subjects"
                >
                  <EmptyHeader>
                    <EmptyTitle>Create your first subject</EmptyTitle>
                    <EmptyDescription>
                      Pick something to learn — the curriculum grows here as crystals to unlock.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={handleCreateSubjectClick}
                      disabled={!onCreateSubject}
                    >
                      New subject
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : (
                <Empty
                  className="my-6 min-h-[12rem] border border-dashed"
                  data-testid="discovery-empty-no-matches"
                >
                  <EmptyHeader>
                    <EmptyTitle>No topics match</EmptyTitle>
                    <EmptyDescription>Try widening your filters to see topics again.</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button type="button" variant="secondary" size="sm" onClick={handleResetFilters}>
                      Reset filters
                    </Button>
                  </EmptyContent>
                </Empty>
              )
            ) : (
              <div className="space-y-6 pb-2">
                {displayTiers.map((tierData) => (
                  <div key={tierData.tier}>
                    <div className="mb-3 flex items-center">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-muted-foreground px-4 text-sm font-semibold">
                        Tier {tierData.tier}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    {showSubjectGroups ? (
                      <div className="space-y-5">
                        {groupTopicsBySubjectInManifestOrder(tierData.topics, subjectOrderRank).map((subjectGroup) => {
                          const headingId = `tier-${tierData.tier}-subject-${subjectGroup.subjectId}`;
                          return (
                            <section
                              key={`${tierData.tier}:${subjectGroup.subjectId}`}
                              aria-labelledby={headingId}
                              className="space-y-2"
                            >
                              <h3
                                id={headingId}
                                className="text-muted-foreground truncate border-b border-border pb-1.5 text-xs font-semibold tracking-wide uppercase"
                              >
                                {subjectGroup.subjectName}
                              </h3>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                                {subjectGroup.topics.map((topic) => (
                                  <DiscoveryTopicTile
                                    key={`${topic.subjectId}:${topic.id}`}
                                    topic={topic}
                                    onSelect={handlePickTopic}
                                  />
                                ))}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                        {tierData.topics.map((topic) => (
                          <DiscoveryTopicTile
                            key={`${topic.subjectId}:${topic.id}`}
                            topic={topic}
                            onSelect={handlePickTopic}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedTopic && selectedTopicStatus && (
        <TopicDetailsPopup
          isOpen
          topic={selectedTopic}
          unlockStatus={selectedTopicStatus}
          onClose={() => setSelectedTopicKey(null)}
          onUnlock={handleUnlock}
        />
      )}
    </>
  );
}

export default DiscoveryModal;
