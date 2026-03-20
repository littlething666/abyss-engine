import { ActiveCrystal, GraphNode, SubjectGraph } from '../../types/core';
import { Rating } from '../../types';
import { BuffEngine } from './buffs/buffEngine';
import {
  ProgressionState,
  StudyLevelUpStep,
  StudySessionCore,
  StudyUndoSnapshot,
} from '../../types/progression';

type RestorableProgressionState = Omit<ProgressionState, 'currentSession'> & {
  currentSession: StudySessionCore;
};

/**
 * Game logic utilities used by the progression feature.
 */
export interface TopicUnlockStatus {
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
  isContentAvailable: boolean;
  isLocked: boolean;
  isUnlocked: boolean;
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

  const fullSession = cloneDeep(state.currentSession);
  const { undoStack: _undoStack, redoStack: _redoStack, ...coreSession } = fullSession;

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
    isCurrentCardFlipped: false,
  };
}

export function trimUndoSnapshotStack<T>(
  stack: T[],
  maxDepth: number = MAX_UNDO_DEPTH,
): T[] {
  return stack.slice(Math.max(0, stack.length - maxDepth));
}

export function calculateLevelFromXP(xp: number): number {
  return Math.min(5, Math.floor(Math.max(0, xp) / 100));
}

const XP_PER_TIER = 100;

/**
 * Builds ordered steps for the study-modal level-up overlay when `nextLevel > previousLevel`.
 * Each step ends at a tier boundary (or final XP on the last step) for sequential bar animation.
 */
export function buildStudyLevelUpSteps(
  previousLevel: number,
  nextLevel: number,
  previousXp: number,
  finalXp: number,
): StudyLevelUpStep[] {
  if (nextLevel <= previousLevel) {
    return [];
  }

  const steps: StudyLevelUpStep[] = [];
  let xpBefore = previousXp;

  for (let lvl = previousLevel + 1; lvl <= nextLevel; lvl += 1) {
    const atMilestone = lvl === nextLevel ? finalXp : lvl * XP_PER_TIER;
    steps.push({
      newLevel: lvl,
      unlockPointsDelta: 1,
      crystalXpAfterStep: atMilestone,
      xpBeforeStep: xpBefore,
    });
    xpBefore = atMilestone;
  }

  return steps;
}

/** Progress within the current growth tier (0–5), for XP bar display. Returns 0–1 fill for the tier band. */
export function getXpTierProgress01(xp: number): number {
  const tier = calculateLevelFromXP(xp);
  if (tier >= 5) {
    return 1;
  }
  const tierFloor = tier * XP_PER_TIER;
  const tierCeil = (tier + 1) * XP_PER_TIER;
  return Math.min(1, Math.max(0, (xp - tierFloor) / (tierCeil - tierFloor)));
}

export function getXpTierLabel(tier: number): string {
  return `Growth tier ${tier}`;
}

function findGraphNode(topicId: string, allGraphs: SubjectGraph[]): GraphNode | undefined {
  for (const graph of allGraphs) {
    const node = graph.nodes.find((item) => item.topicId === topicId);
    if (node) {
      return node;
    }
  }
  return undefined;
}

function findTopicSubject(topicId: string, allGraphs: SubjectGraph[]): string | undefined {
  for (const graph of allGraphs) {
    if (graph.nodes.some((node) => node.topicId === topicId)) {
      return graph.subjectId;
    }
  }
  return undefined;
}

function resolveTopic(
  topicId: string,
  allTopics: TopicData[],
  allGraphs: SubjectGraph[],
): TopicData | undefined {
  const topicFromAll = allTopics.find((topic) => topic.id === topicId);
  if (topicFromAll) {
    return topicFromAll;
  }

  const node = findGraphNode(topicId, allGraphs);
  if (!node) {
    return undefined;
  }

  return {
    id: node.topicId,
    name: node.title,
    description: node.learningObjective,
    subjectId: findTopicSubject(topicId, allGraphs) ?? '',
    cardIds: [],
    prerequisites: (node.prerequisites || []).map((prereq) => ({
      topicId: prereq,
      requiredLevel: 1,
    })),
  };
}

function toSubjectMap(subjects: SubjectLike[] = []): Record<string, SubjectLike> {
  return subjects.reduce<Record<string, SubjectLike>>((acc, subject) => {
    acc[subject.id] = subject;
    return acc;
  }, {});
}

export function calculateTopicTier(topicId: string, allGraphs: SubjectGraph[] = []): number {
  const visited = new Set<string>();

  const resolve = (id: string, stack: Set<string>): number => {
    if (stack.has(id)) {
      return 1;
    }

    if (visited.has(id)) {
      return 1;
    }

    const node = findGraphNode(id, allGraphs);
    if (!node || !node.prerequisites.length) {
      visited.add(id);
      return 1;
    }

    const nextStack = new Set(stack);
    nextStack.add(id);

    let maxPrereqTier = 0;
    for (const prereqId of node.prerequisites) {
      const prereqTier = resolve(prereqId, nextStack);
      if (prereqTier > maxPrereqTier) {
        maxPrereqTier = prereqTier;
      }
    }

    visited.add(id);
    return maxPrereqTier + 1;
  };

  return resolve(topicId, new Set());
}

export function getTopicUnlockStatus(
  topicId: string,
  activeCrystals: ActiveCrystal[],
  unlockPoints: number,
  allGraphs: SubjectGraph[] = [],
  allTopics: TopicData[] = [],
): TopicUnlockStatus {
  const topic = resolveTopic(topicId, allTopics, allGraphs);

  if (!topic) {
    return {
      canUnlock: false,
      hasPrerequisites: false,
      hasEnoughPoints: false,
      missingPrerequisites: [],
    };
  }

  const prerequisites = topic.prerequisites || [];
  const hasEnoughPoints = unlockPoints >= 1;

  if (prerequisites.length === 0) {
    return {
      canUnlock: hasEnoughPoints,
      hasPrerequisites: true,
      hasEnoughPoints,
      missingPrerequisites: [],
    };
  }

  const missingPrereqs: TopicUnlockStatus['missingPrerequisites'] = [];
  let allPrereqsMet = true;

  for (const prereq of prerequisites) {
    const prereqCrystal = activeCrystals.find((crystal) => crystal.topicId === prereq.topicId);
    const prereqLevel = calculateLevelFromXP(prereqCrystal?.xp ?? 0);

    if (prereqLevel < prereq.requiredLevel) {
      allPrereqsMet = false;
      missingPrereqs.push({
        topicId: prereq.topicId,
        topicName: allTopics.find((t) => t.id === prereq.topicId)?.name || prereq.topicId,
        requiredLevel: prereq.requiredLevel,
        currentLevel: prereqLevel,
      });
    }
  }

  return {
    canUnlock: allPrereqsMet && hasEnoughPoints,
    hasPrerequisites: allPrereqsMet,
    hasEnoughPoints,
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

export function getTopicsByTier(
  allGraphs: SubjectGraph[] = [],
  unlockedTopicIds: string[] = [],
  subjects: SubjectLike[] = [],
  currentSubjectId?: string | null,
) {
  const subjectMap = toSubjectMap(subjects);
  const tierMap = new Map<number, TieredTopic[]>();

  const graphs = currentSubjectId
    ? allGraphs.filter((graph) => graph.subjectId === currentSubjectId)
    : allGraphs;

  for (const graph of graphs) {
    for (const node of graph.nodes) {
      const tier = node.tier || calculateTopicTier(node.topicId, allGraphs);
      const subjectName = subjectMap[graph.subjectId]?.name || 'Unknown';
      const topicData: TieredTopic = {
        id: node.topicId,
        name: node.title,
        description: node.learningObjective,
        subjectId: graph.subjectId,
        subjectName,
        isContentAvailable: true,
        isLocked: !unlockedTopicIds.includes(node.topicId),
        isUnlocked: unlockedTopicIds.includes(node.topicId),
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
