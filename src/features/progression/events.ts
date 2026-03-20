type RatingValue = 1 | 2 | 3 | 4;

export type StudyPanelHistoryAction = 'undo' | 'redo' | 'submit' | 'session-complete';

export interface ProgressionEventMap {
  'study-panel-history': {
    action: StudyPanelHistoryAction;
    topicId?: string;
    sessionId?: string;
    undoCount?: number;
    redoCount?: number;
  };
  'xp-gained': {
    amount: number;
    rating: RatingValue;
    sessionId: string;
    cardId?: string;
    topicId?: string;
    difficulty?: number;
    isCorrect?: boolean;
    timeTakenMs?: number;
    buffMultiplier?: number;
    reward?: number;
  };
  'session-complete': {
    topicId: string;
    sessionId?: string;
    correctRate: number;
    sessionDurationMs?: number;
    totalAttempts: number;
  };
  'level-up': {
    topicId: string;
    sessionId: string;
    fromLevel: number;
    toLevel: number;
    unlockPointsGained: number;
    stepsCount: number;
  };
}

export type ProgressionEventType = keyof ProgressionEventMap;
export type ProgressionEventPayload<T extends ProgressionEventType> = ProgressionEventMap[T];
