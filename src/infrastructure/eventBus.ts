import type { Buff } from '@/types/progression';

type Rating = 1 | 2 | 3 | 4;

export type AppEventMap = {
  'card:reviewed': {
    cardId: string;
    rating: Rating;
    topicId: string;
    sessionId: string;
    timeTakenMs: number;
    buffedReward: number;
    buffMultiplier: number;
    difficulty: number;
    isCorrect: boolean;
  };
  'xp:gained': {
    topicId: string;
    amount: number;
    sessionId: string;
    cardId: string;
  };
  'crystal:leveled': {
    topicId: string;
    from: number;
    to: number;
    levelsGained: number;
    sessionId: string;
    isStudyPanelOpen: boolean;
  };
  'session:completed': {
    topicId: string;
    sessionId: string;
    correctRate: number;
    sessionDurationMs: number;
    totalAttempts: number;
  };
  'ritual:submitted': {
    topicId: string;
    harmonyScore: number;
    readinessBucket: string;
    checklistKeys: string[];
    buffsGranted: Buff[];
  };
  'study-panel:history': {
    action: 'undo' | 'redo' | 'submit';
    topicId?: string;
    sessionId?: string;
    undoCount: number;
    redoCount: number;
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
