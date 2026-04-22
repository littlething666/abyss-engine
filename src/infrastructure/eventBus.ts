import type { Buff } from '@/types/progression';
import type { StudyChecklist } from '@/types/studyChecklist';
import type { TopicLattice } from '@/types/topicLattice';

type Rating = 1 | 2 | 3 | 4;

export type AppEventMap = {
  'card:reviewed': {
    cardId: string;
    rating: Rating;
    subjectId: string;
    topicId: string;
    sessionId: string;
    timeTakenMs: number;
    buffedReward: number;
    buffMultiplier: number;
    difficulty: number;
    isCorrect: boolean;
  };
  'xp:gained': {
    subjectId: string;
    topicId: string;
    amount: number;
    sessionId: string;
    cardId: string;
  };
  'crystal:leveled': {
    subjectId: string;
    topicId: string;
    from: number;
    to: number;
    levelsGained: number;
    sessionId: string;
    /** True when any modal/dialog is open at emission time. */
    isDialogOpen: boolean;
  };
  'session:completed': {
    subjectId: string;
    topicId: string;
    sessionId: string;
    correctRate: number;
    sessionDurationMs: number;
    totalAttempts: number;
  };
  'ritual:submitted': {
    subjectId: string;
    topicId: string;
    harmonyScore: number;
    readinessBucket: string;
    checklistKeys: string[];
    buffsGranted: Buff[];
  };
  'study-panel:history': {
    action: 'undo' | 'redo' | 'submit';
    subjectId?: string;
    topicId?: string;
    sessionId?: string;
    undoCount: number;
    redoCount: number;
  };
  /** Emitted when the study panel is shown (after `startTopicStudySession` in normal flows). */
  'study-panel:opened': Record<string, never>;
  'topic:generation-pipeline': {
    subjectId: string;
    topicId: string;
    enableReasoning?: boolean;
    /** When true, never skip generation because `topicStudyContentReady` is satisfied. */
    forceRegenerate?: boolean;
    /** Defaults to `full` in the runner when omitted. */
    stage?: 'theory' | 'study-cards' | 'mini-games' | 'full';
  };
  'subject:generation-pipeline': {
    subjectId: string;
    checklist: StudyChecklist;
  };
  /** Emitted after a two-stage subject graph is validated and persisted. */
  'subjectGraph.generated': {
    subjectId: string;
    boundModel: string;
    stageADurationMs: number;
    stageBDurationMs: number;
    /** Depth of the manual `retryOf` job chain for this run (0 = fresh pipeline). */
    retryCount: number;
    lattice: TopicLattice;
    prereqEdgesCorrectionApplied?: boolean;
    prereqEdgesCorrectionRemovedCount?: number;
    prereqEdgesCorrectionAddedCount?: number;
    prereqEdgesCorrection?: {
      removed: Array<{ topicId: string; prereqId: string; reason: string }>;
      added: Array<{ topicId: string; prereqId: string; kind: 'filler-tier1' | 'filler-tier2' }>;
    };
  };
  /** Emitted when topic lattice or prerequisite wiring fails validation or parsing. */
  'subjectGraph.validationFailed': {
    subjectId: string;
    stage: 'topics' | 'edges';
    error: string;
    offendingTopicIds: string[];
    boundModel: string;
    retryCount: number;
    stageDurationMs: number;
    latticeSnapshot?: TopicLattice;
  };
  /** Fired when positive crystal XP gains should trigger background trial pre-generation. */
  'crystal:trial-pregenerate': {
    subjectId: string;
    topicId: string;
    currentLevel: number;
    targetLevel: number;
  };
  /** Fired when a Crystal Trial is submitted and evaluated. */
  'crystal:trial-completed': {
    subjectId: string;
    topicId: string;
    targetLevel: number;
    passed: boolean;
    score: number;
    trialId: string;
  };
};

const PREFIX = 'abyss-';

function createAppEventBus() {
  const canDispatch = typeof window !== 'undefined';
  return {
    emit<K extends keyof AppEventMap>(event: K, payload: AppEventMap[K]) {
      if (!canDispatch) return;
      window.dispatchEvent(
        new CustomEvent(`${PREFIX}${String(event)}`, { detail: payload }),
      );
    },
    on<K extends keyof AppEventMap>(
      event: K,
      handler: (payload: AppEventMap[K]) => void,
    ): () => void {
      if (!canDispatch) return () => {};
      const listener = (e: Event) => handler((e as CustomEvent<AppEventMap[K]>).detail);
      const type = `${PREFIX}${String(event)}`;
      window.addEventListener(type, listener);
      return () => window.removeEventListener(type, listener);
    },
  };
}

export type AppEventBus = ReturnType<typeof createAppEventBus>;
export const appEventBus = createAppEventBus();
