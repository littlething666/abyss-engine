import { normalizeGraphPrerequisites } from '@/lib/graphPrerequisites';
import { topicRefKey } from '@/lib/topicRef';
import {
  CRYSTAL_XP_PER_LEVEL,
  MAX_CRYSTAL_LEVEL,
  calculateLevelFromXP,
} from '@/types/crystalLevel';
import { ActiveCrystal, SubjectGraph, TopicRef } from '../../types/core';
import type { TopicIconName } from '../../types/core';
import { Rating } from '../../types';
import { BuffEngine } from './buffs/buffEngine';
import {
  ProgressionState,
  StudySessionCore,
  StudyUndoSnapshot,
  type TopicContentStatus,
} from '../../types/progression';

type RestorableProgressionState = Omit<ProgressionState, 'currentSession'> & {
  currentSession: StudySessionCore;
};

/**
 * Game logic utilities used by the progression feature.
 */
export interface TopicUnlockStatus {
  canUnlock: boolean;
  /** Topic graph prerequisites (crystal levels) satisfied; excludes unlock points. */
  hasPrerequisites: boolean;
  hasEnoughPoints: boolean;
  /** Current unlock-point balance (for UI copy). */
  unlockPoints: number;
  missingPrerequisites: {
    topicId: string;
    topicName: string;
    requiredLevel: number;
    currentLevel: number;
  }[];
}

interface TopicPrerequisite {
  topicId: string;
  requiredLevel: number;
}

interface TopicDescriptor {
  id: string;
  name: string;
  description: string;
  subjectId: string;
  cardIds?: string[];
  prerequisites?: TopicPrerequisite[];
}

type TopicData = Omit<TopicDescriptor, 'cardIds'> & {
  cardIds?: string[];
};

export interface TieredTopic {
  id: string;
  name: string;
  description: string;
  subjectId: string;
  subjectName: string;
  /**
   * Curated lucide icon name copied directly from the topic's graph node.
   * Validated upstream by `topicLatticeSchema` / `graphSchema`; downstream
   * components consume it through the typed `TopicIcon` registry.
   */
  iconName: TopicIconName;
  /** Tri-state content status: 'ready' | 'generating' | 'unavailable'. */
  contentStatus: TopicContentStatus;
  isLocked: boolean;
  isUnlocked: boolean;
  /** False when prerequisite crystal levels hide this topic from the curriculum list (tier > 1). */
  isCurriculumVisible: boolean;
}

export interface SubjectLike {
  id: string;
  name: string;
}

export const MAX_UNDO_DEPTH = 50;

function cloneDeep<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function captureUndoSnapshot(state: ProgressionState): StudyUndoSnapshot {
  if (!state.currentSession) {
    throw new Error('Cannot capture undo snapshot without an active session.');
  }

  const coreSession = cloneDeep(state.currentSession);

  return {
    timestamp: Date.now(),
    sm2Data: cloneDeep(state.sm2Data),
    activeCrystals: cloneDeep(state.activeCrystals),
    activeBuffs: cloneDeep(state.activeBuffs),
    unlockPoints: state.unlockPoints,
    resonancePoints: state.resonancePoints,
    currentSession: coreSession,
  };
}

export function restoreUndoSnapshot(state: ProgressionState, snapshot: StudyUndoSnapshot): RestorableProgressionState {
  if (!snapshot.currentSession) {
    throw new Error('Invalid snapshot: currentSession is required for restore.');
  }

  const restoredActiveBuffs = BuffEngine.get().pruneExpired(
    snapshot.activeBuffs.map((buff) => BuffEngine.get().hydrateBuff(buff)),
  );

  return {
    ...state,
    sm2Data: snapshot.sm2Data,
    activeCrystals: snapshot.activeCrystals,
    activeBuffs: restoredActiveBuffs,
    unlockPoints: snapshot.unlockPoints,
    resonancePoints: snapshot.resonancePoints,
    currentSession: snapshot.currentSession,
  };
}

export function trimUndoSnapshotStack<T>(
  stack: T[],
  maxDepth: number = MAX_UNDO_DEPTH,
): T[] {
  return stack.slice(Math.max(0, stack.length - maxDepth));
}

/**
 * Topic ids that may appear in curriculum / graph UI: tier 1 always; higher tiers when
 * prerequisites are empty (always) or at least one listed prerequisite has an active crystal.
 * Graph `minLevel` is ignored here — unlock eligibility still uses minLevel via `getTopicUnlockStatus`.
 */
export function getVisibleTopicIds(graph: SubjectGraph, activeCrystals: readonly ActiveCrystal[]): Set<string> {
  const crystalTopicIds = new Set(
    activeCrystals.filter((c) => c.subjectId === graph.subjectId).map((c) => c.topicId),
  );

  const visible = new Set<string>();
  for (const node of graph.nodes) {
    if (node.tier === 1) {
      visible.add(node.topicId);
      continue;
    }

    const prereqs = normalizeGraphPrerequisites(node.prerequisites);
    if (prereqs.length === 0) {
      visible.add(node.topicId);
      continue;
    }

    const anyPrereqUnlocked = prereqs.some((p) => crystalTopicIds.has(p.topicId));
    if (anyPrereqUnlocked) {
      visible.add(node.topicId);
    }
  }

  return visible;
}

/** Result of applying an XP delta to one topic's crystal (used by study + addXP for consistent unlock rewards). */
export interface CrystalXpDeltaResult {
  nextXp: number;
  previousLevel: number;
  nextLevel: number;
  /** `nextLevel - previousLevel`; positive when unlock points should be granted (mirrors study behavior). */
  levelsGained: number;
  nextActiveCrystals: ActiveCrystal[];
}

/**
 * Applies `xpDelta` to the crystal for `topicId` in `activeCrystals` (total XP clamped at 0).
 * Returns null if no matching crystal exists.
 */
export function applyCrystalXpDelta(
  activeCrystals: ActiveCrystal[],
  ref: TopicRef,
  xpDelta: number,
): CrystalXpDeltaResult | null {
  const crystal = activeCrystals.find(
    (item) => item.subjectId === ref.subjectId && item.topicId === ref.topicId,
  );
  if (!crystal) {
    return null;
  }

  const previousXp = crystal.xp;
  const nextXp = Math.max(0, previousXp + xpDelta);
  const previousLevel = calculateLevelFromXP(previousXp);
  const nextLevel = calculateLevelFromXP(nextXp);
  const levelsGained = nextLevel - previousLevel;
  const nextActiveCrystals = activeCrystals.map((item) =>
    item.subjectId === ref.subjectId && item.topicId === ref.topicId ? { ...item, xp: nextXp } : item,
  );

  return {
    nextXp,
    previousLevel,
    nextLevel,
    levelsGained,
    nextActiveCrystals,
  };
}

export interface CrystalLevelProgressToNext {
  level: number;
  /** 0–100 for `Progress` UI; 100 when `isMax`. */
  progressPercent: number;
  isMax: boolean;
  /** Total XP after clamping negatives to 0 (same basis as level math). */
  totalXp: number;
}

/** XP left to reach the next band boundary (e.g. from 50 → 50, from 99 → 1). */
export function getXpToNextBandThreshold(xp: number): number {
  const safeXp = Math.max(0, xp);
  const level = calculateLevelFromXP(safeXp);

  if (level >= MAX_CRYSTAL_LEVEL) {
    return 0;
  }

  const nextThreshold = (level + 1) * CRYSTAL_XP_PER_LEVEL;
  return Math.max(0, nextThreshold - safeXp);
}

/**
 * Progress within the current level band toward the next level (or max).
 */
export function getCrystalLevelProgressToNext(xp: number): CrystalLevelProgressToNext {
  const safeXp = Math.max(0, xp);
  const level = calculateLevelFromXP(safeXp);
  if (level >= MAX_CRYSTAL_LEVEL) {
    return { level, progressPercent: 100, isMax: true, totalXp: safeXp };
  }
  const xpIntoLevel = safeXp - level * CRYSTAL_XP_PER_LEVEL;
  const progressPercent = (xpIntoLevel / CRYSTAL_XP_PER_LEVEL) * 100;
  return { level, progressPercent, isMax: false, totalXp: safeXp };
}

function graphForSubject(subjectId: string, allGraphs: SubjectGraph[]): SubjectGraph | undefined {
  return allGraphs.find((g) => g.subjectId === subjectId);
}

function resolveTopic(
  ref: TopicRef,
  allTopics: TopicData[],
  allGraphs: SubjectGraph[],
): TopicData | undefined {
  const topicFromAll = allTopics.find(
    (topic) => topic.id === ref.topicId && topic.subjectId === ref.subjectId,
  );
  if (topicFromAll) {
    return topicFromAll;
  }

  const graph = graphForSubject(ref.subjectId, allGraphs);
  const node = graph?.nodes.find((item) => item.topicId === ref.topicId);
  if (!node) {
    return undefined;
  }

  return {
    id: node.topicId,
    name: node.title,
    description: node.learningObjective,
    subjectId: ref.subjectId,
    cardIds: [],
    prerequisites: normalizeGraphPrerequisites(node.prerequisites).map((p) => ({
      topicId: p.topicId,
      requiredLevel: p.minLevel,
    })),
  };
}

function toSubjectMap(subjects: SubjectLike[] = []): Record<string, SubjectLike> {
  return subjects.reduce<Record<string, SubjectLike>>((acc, subject) => {
    acc[subject.id] = subject;
    return acc;
  }, {});
}

export function calculateTopicTier(ref: TopicRef, allGraphs: SubjectGraph[] = []): number {
  const graph = graphForSubject(ref.subjectId, allGraphs);
  if (!graph) {
    return 1;
  }

  const visited = new Set<string>();

  const resolve = (topicId: string, stack: Set<string>): number => {
    if (stack.has(topicId)) {
      return 1;
    }

    if (visited.has(topicId)) {
      return 1;
    }

    const node = graph.nodes.find((n) => n.topicId === topicId);
    const prereqNorm = node ? normalizeGraphPrerequisites(node.prerequisites) : [];
    if (!node || prereqNorm.length === 0) {
      visited.add(topicId);
      return 1;
    }

    const nextStack = new Set(stack);
    nextStack.add(topicId);

    let maxPrereqTier = 0;
    for (const { topicId: prereqId } of prereqNorm) {
      const prereqTier = resolve(prereqId, nextStack);
      if (prereqTier > maxPrereqTier) {
        maxPrereqTier = prereqTier;
      }
    }

    visited.add(topicId);
    return maxPrereqTier + 1;
  };

  return resolve(ref.topicId, new Set());
}

export function getTopicUnlockStatus(
  ref: TopicRef,
  activeCrystals: ActiveCrystal[],
  unlockPoints: number,
  allGraphs: SubjectGraph[] = [],
  allTopics: TopicData[] = [],
): TopicUnlockStatus {
  const topic = resolveTopic(ref, allTopics, allGraphs);

  if (!topic) {
    return {
      canUnlock: false,
      hasPrerequisites: false,
      hasEnoughPoints: false,
      unlockPoints,
      missingPrerequisites: [],
    };
  }

  const graph = graphForSubject(ref.subjectId, allGraphs);
  const prerequisites = topic.prerequisites || [];
  const hasEnoughPoints = unlockPoints >= 1;

  if (prerequisites.length === 0) {
    return {
      canUnlock: hasEnoughPoints,
      hasPrerequisites: true,
      hasEnoughPoints,
      unlockPoints,
      missingPrerequisites: [],
    };
  }

  const missingPrereqs: TopicUnlockStatus['missingPrerequisites'] = [];
  let allPrereqsMet = true;

  for (const prereq of prerequisites) {
    const prereqCrystal = activeCrystals.find(
      (crystal) => crystal.subjectId === ref.subjectId && crystal.topicId === prereq.topicId,
    );
    const prereqLevel = calculateLevelFromXP(prereqCrystal?.xp ?? 0);

    if (prereqLevel < prereq.requiredLevel) {
      allPrereqsMet = false;
      const topicName =
        graph?.nodes.find((n) => n.topicId === prereq.topicId)?.title
        ?? allTopics.find((t) => t.id === prereq.topicId && t.subjectId === ref.subjectId)?.name
        ?? prereq.topicId;
      missingPrereqs.push({
        topicId: prereq.topicId,
        topicName,
        requiredLevel: prereq.requiredLevel,
        currentLevel: prereqLevel,
      });
    }
  }

  return {
    canUnlock: allPrereqsMet && hasEnoughPoints,
    hasPrerequisites: allPrereqsMet,
    hasEnoughPoints,
    unlockPoints,
    missingPrerequisites: missingPrereqs,
  };
}

export function calculateXPReward(formatType: string | undefined, rating: Rating = 3): number {
  let baseXP: number;

  switch (formatType) {
    case 'single_choice':
    case 'single-choice':
    case 'SINGLE_CHOICE':
      baseXP = 12;
      break;
    case 'multi_choice':
    case 'multi-choice':
    case 'MULTI_CHOICE':
      baseXP = 15;
      break;
    case 'mini_game':
    case 'MINI_GAME':
      baseXP = 20;
      break;
    case 'flashcard':
    case 'FLASHCARD':
    default:
      baseXP = 10;
      break;
  }

  switch (rating) {
    case 1:
      return 0;
    case 2:
      return Math.floor(baseXP * 0.5);
    case 3:
      return baseXP;
    case 4:
      return Math.floor(baseXP * 1.5);
    default:
      return baseXP;
  }
}

export function filterCardsByDifficulty<T extends { difficulty: number }>(
  cards: T[],
  maxDifficulty: number,
): T[] {
  return cards.filter((card) => card.difficulty <= maxDifficulty);
}

function resolveTopicContentStatus(
  tKey: string,
  contentStatusByTopicKey?: Record<string, TopicContentStatus>,
): TopicContentStatus {
  if (!contentStatusByTopicKey) {
    return 'ready';
  }
  return contentStatusByTopicKey[tKey] ?? 'unavailable';
}

export function getTopicsByTier(
  allGraphs: SubjectGraph[] = [],
  subjects: SubjectLike[] = [],
  currentSubjectId?: string | null,
  /** Tri-state map keyed by `topicRefKey`. Omitted → all topics treated as `'ready'`. */
  contentStatusByTopicKey?: Record<string, TopicContentStatus>,
  /** When set, `isCurriculumVisible` reflects prerequisite crystal levels per graph; unlock flags use crystal list. */
  activeCrystals?: readonly ActiveCrystal[],
) {
  const subjectMap = toSubjectMap(subjects);
  const tierMap = new Map<number, TieredTopic[]>();
  const unlockedKeys = new Set(
    (activeCrystals ?? []).map((c) => topicRefKey({ subjectId: c.subjectId, topicId: c.topicId })),
  );

  const graphs = currentSubjectId
    ? allGraphs.filter((graph) => graph.subjectId === currentSubjectId)
    : allGraphs;

  for (const graph of graphs) {
    const visibleIds = activeCrystals ? getVisibleTopicIds(graph, activeCrystals) : null;
    for (const node of graph.nodes) {
      const ref: TopicRef = { subjectId: graph.subjectId, topicId: node.topicId };
      const tKey = topicRefKey(ref);
      const tier = node.tier || calculateTopicTier(ref, allGraphs);
      const subjectName = subjectMap[graph.subjectId]?.name || 'Unknown';
      const contentStatus = resolveTopicContentStatus(tKey, contentStatusByTopicKey);
      const topicData: TieredTopic = {
        id: node.topicId,
        name: node.title,
        description: node.learningObjective,
        subjectId: graph.subjectId,
        subjectName,
        iconName: node.iconName,
        contentStatus,
        isLocked: !unlockedKeys.has(tKey),
        isUnlocked: unlockedKeys.has(tKey),
        isCurriculumVisible: visibleIds ? visibleIds.has(node.topicId) : true,
      };

      const current = tierMap.get(tier);
      if (current) {
        current.push(topicData);
      } else {
        tierMap.set(tier, [topicData]);
      }
    }
  }

  const sortedTiers = Array.from(tierMap.keys()).sort((a, b) => a - b);
  return sortedTiers.map((tier) => ({ tier, topics: tierMap.get(tier) || [] }));
}
