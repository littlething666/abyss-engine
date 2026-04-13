import { normalizeGraphPrerequisites } from '@/lib/graphPrerequisites';
import { ActiveCrystal, GraphNode, SubjectGraph } from '../../types/core';
import { Rating } from '../../types';
import { BuffEngine } from './buffs/buffEngine';
import {
  ProgressionState,
  StudySessionCore,
  StudyUndoSnapshot,
} from '../../types/progression';
import type { SubjectTopicRef, TopicRefKey } from '../../lib/topicRef';
import { topicRefKey } from '../../lib/topicRef';

type RestorableProgressionState = Omit<ProgressionState, 'currentSession'> & {
  currentSession: StudySessionCore;
};

export interface TopicUnlockStatus {
  canUnlock: boolean;
  hasPrerequisites: boolean;
  hasEnoughPoints: boolean;
  unlockPoints: number;
  missingPrerequisites: {
    topicId: string;
    topicName: string;
    requiredLevel: number;
    currentLevel: number;
  }[];
}

export interface TieredTopic {
  id: string;
  name: string;
  description: string;
  subjectId: string;
  subjectName: string;
  isContentAvailable: boolean;
  isLocked: boolean;
  isUnlocked: boolean;
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
    currentSession: snapshot.currentSession,
  };
}

export function trimUndoSnapshotStack<T>(stack: T[], maxDepth: number = MAX_UNDO_DEPTH): T[] {
  return stack.slice(Math.max(0, stack.length - maxDepth));
}

export const CRYSTAL_XP_PER_LEVEL = 100;
export const MAX_CRYSTAL_LEVEL = 5;

export function calculateLevelFromXP(xp: number): number {
  return Math.min(MAX_CRYSTAL_LEVEL, Math.floor(Math.max(0, xp) / CRYSTAL_XP_PER_LEVEL));
}

/**
 * Topic ids visible in curriculum UI. Tier 1 always visible; higher tiers when
 * at least one prerequisite has an active crystal **within the same subject**.
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
    if (prereqs.some((p) => crystalTopicIds.has(p.topicId))) {
      visible.add(node.topicId);
    }
  }
  return visible;
}

export interface CrystalXpDeltaResult {
  nextXp: number;
  previousLevel: number;
  nextLevel: number;
  levelsGained: number;
  nextActiveCrystals: ActiveCrystal[];
}

/** Applies `xpDelta` to the crystal matching `(subjectId, topicId)`. Returns null if not found. */
export function applyCrystalXpDelta(
  activeCrystals: ActiveCrystal[],
  ref: SubjectTopicRef,
  xpDelta: number,
): CrystalXpDeltaResult | null {
  const crystal = activeCrystals.find(
    (item) => item.subjectId === ref.subjectId && item.topicId === ref.topicId,
  );
  if (!crystal) return null;
  const previousXp = crystal.xp;
  const nextXp = Math.max(0, previousXp + xpDelta);
  const previousLevel = calculateLevelFromXP(previousXp);
  const nextLevel = calculateLevelFromXP(nextXp);
  return {
    nextXp,
    previousLevel,
    nextLevel,
    levelsGained: nextLevel - previousLevel,
    nextActiveCrystals: activeCrystals.map((item) =>
      item.subjectId === ref.subjectId && item.topicId === ref.topicId ? { ...item, xp: nextXp } : item,
    ),
  };
}

export interface CrystalLevelProgressToNext {
  level: number;
  progressPercent: number;
  isMax: boolean;
  totalXp: number;
}

export function getCrystalLevelProgressToNext(xp: number): CrystalLevelProgressToNext {
  const safeXp = Math.max(0, xp);
  const level = calculateLevelFromXP(safeXp);
  if (level >= MAX_CRYSTAL_LEVEL) {
    return { level, progressPercent: 100, isMax: true, totalXp: safeXp };
  }
  const xpIntoLevel = safeXp - level * CRYSTAL_XP_PER_LEVEL;
  return { level, progressPercent: (xpIntoLevel / CRYSTAL_XP_PER_LEVEL) * 100, isMax: false, totalXp: safeXp };
}

function toSubjectMap(subjects: SubjectLike[] = []): Record<string, SubjectLike> {
  return subjects.reduce<Record<string, SubjectLike>>((acc, subject) => {
    acc[subject.id] = subject;
    return acc;
  }, {});
}

/** Calculates tier within the subject's graph. Prerequisites resolved intra-subject only. */
export function calculateTopicTier(ref: SubjectTopicRef, allGraphs: SubjectGraph[] = []): number {
  const graph = allGraphs.find((g) => g.subjectId === ref.subjectId);
  if (!graph) return 1;
  const visited = new Set<string>();
  const resolve = (id: string, stack: Set<string>): number => {
    if (stack.has(id) || visited.has(id)) return 1;
    const node = graph.nodes.find((n) => n.topicId === id);
    const prereqNorm = node ? normalizeGraphPrerequisites(node.prerequisites) : [];
    if (!node || prereqNorm.length === 0) { visited.add(id); return 1; }
    const nextStack = new Set(stack); nextStack.add(id);
    let maxPrereqTier = 0;
    for (const { topicId: prereqId } of prereqNorm) {
      const t = resolve(prereqId, nextStack);
      if (t > maxPrereqTier) maxPrereqTier = t;
    }
    visited.add(id);
    return maxPrereqTier + 1;
  };
  return resolve(ref.topicId, new Set());
}

/** Prerequisites resolved intra-subject via the subject's graph. */
export function getTopicUnlockStatus(
  ref: SubjectTopicRef,
  activeCrystals: ActiveCrystal[],
  unlockPoints: number,
  allGraphs: SubjectGraph[] = [],
): TopicUnlockStatus {
  const graph = allGraphs.find((g) => g.subjectId === ref.subjectId);
  const node = graph?.nodes.find((n) => n.topicId === ref.topicId);
  if (!node) {
    return { canUnlock: false, hasPrerequisites: false, hasEnoughPoints: false, unlockPoints, missingPrerequisites: [] };
  }
  const prerequisites = normalizeGraphPrerequisites(node.prerequisites);
  const hasEnoughPoints = unlockPoints >= 1;
  if (prerequisites.length === 0) {
    return { canUnlock: hasEnoughPoints, hasPrerequisites: true, hasEnoughPoints, unlockPoints, missingPrerequisites: [] };
  }
  const missingPrereqs: TopicUnlockStatus['missingPrerequisites'] = [];
  let allPrereqsMet = true;
  for (const prereq of prerequisites) {
    const prereqCrystal = activeCrystals.find(
      (c) => c.subjectId === ref.subjectId && c.topicId === prereq.topicId,
    );
    const prereqLevel = calculateLevelFromXP(prereqCrystal?.xp ?? 0);
    if (prereqLevel < prereq.minLevel) {
      allPrereqsMet = false;
      const prereqNode = graph?.nodes.find((n) => n.topicId === prereq.topicId);
      missingPrereqs.push({
        topicId: prereq.topicId,
        topicName: prereqNode?.title || prereq.topicId,
        requiredLevel: prereq.minLevel,
        currentLevel: prereqLevel,
      });
    }
  }
  return { canUnlock: allPrereqsMet && hasEnoughPoints, hasPrerequisites: allPrereqsMet, hasEnoughPoints, unlockPoints, missingPrerequisites: missingPrereqs };
}

export function calculateXPReward(formatType: string | undefined, rating: Rating = 3): number {
  let baseXP: number;
  switch (formatType) {
    case 'single_choice': case 'single-choice': case 'SINGLE_CHOICE': baseXP = 12; break;
    case 'multi_choice': case 'multi-choice': case 'MULTI_CHOICE': baseXP = 15; break;
    case 'mini_game': case 'MINI_GAME': baseXP = 20; break;
    case 'flashcard': case 'FLASHCARD': default: baseXP = 10; break;
  }
  switch (rating) {
    case 1: return 0;
    case 2: return Math.floor(baseXP * 0.5);
    case 3: return baseXP;
    case 4: return Math.floor(baseXP * 1.5);
    default: return baseXP;
  }
}

export function filterCardsByDifficulty<T extends { difficulty: number }>(cards: T[], maxDifficulty: number): T[] {
  return cards.filter((card) => card.difficulty <= maxDifficulty);
}

/**
 * Groups graph nodes by tier with unlock/visibility/content-availability annotations.
 * @param activeCrystals Full crystal list; composite (subjectId, topicId) matching for unlock checks.
 * @param contentAvailabilityByTopicRef Keyed by TopicRefKey via topicRefKey().
 */
export function getTopicsByTier(
  allGraphs: SubjectGraph[] = [],
  activeCrystals: readonly ActiveCrystal[] = [],
  subjects: SubjectLike[] = [],
  currentSubjectId?: string | null,
  contentAvailabilityByTopicRef?: Record<TopicRefKey, boolean>,
) {
  const subjectMap = toSubjectMap(subjects);
  const tierMap = new Map<number, TieredTopic[]>();
  const graphs = currentSubjectId
    ? allGraphs.filter((graph) => graph.subjectId === currentSubjectId)
    : allGraphs;
  for (const graph of graphs) {
    const visibleIds = getVisibleTopicIds(graph, activeCrystals);
    for (const node of graph.nodes) {
      const tier = node.tier || calculateTopicTier({ subjectId: graph.subjectId, topicId: node.topicId }, allGraphs);
      const subjectName = subjectMap[graph.subjectId]?.name || 'Unknown';
      const refKey = topicRefKey(graph.subjectId, node.topicId);
      const isUnlocked = activeCrystals.some(
        (c) => c.subjectId === graph.subjectId && c.topicId === node.topicId,
      );
      const topicData: TieredTopic = {
        id: node.topicId,
        name: node.title,
        description: node.learningObjective,
        subjectId: graph.subjectId,
        subjectName,
        isContentAvailable: contentAvailabilityByTopicRef ? Boolean(contentAvailabilityByTopicRef[refKey]) : true,
        isLocked: !isUnlocked,
        isUnlocked,
        isCurriculumVisible: visibleIds.has(node.topicId),
      };
      const current = tierMap.get(tier);
      if (current) { current.push(topicData); } else { tierMap.set(tier, [topicData]); }
    }
  }
  return Array.from(tierMap.keys()).sort((a, b) => a - b).map((tier) => ({ tier, topics: tierMap.get(tier) || [] }));
}
