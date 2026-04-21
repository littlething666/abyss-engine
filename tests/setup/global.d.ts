import '@playwright/test';
import type { AbyssSceneSnapshot } from '../../src/utils/abyssSceneProbe';

declare global {
  namespace PlaywrightTest {
    interface Matchers<R> {
      /**
       * Custom matcher to check if element contains specific text
       */
      toContainText(text: string): Promise<R>;
    }
  }

  // Extend Window interface for custom properties
  interface Window {
    __FRAME_COUNT__?: number;
    __LAST_FRAME_TIME__?: number;
    __abyssScene?: {
      snapshot: AbyssSceneSnapshot | null;
      frameCount: number;
      ready: boolean;
      sceneRef: unknown;
    };
    __progressionEvents?: Array<{ type: string; detail: unknown; at: number }>;
    __progressionEventProbeInstalled?: boolean;
    abyssDev?: {
      spawnCrystal: (topicId: string) => Promise<void>;
      makeAllCardsDue: () => void;
      setCurrentCard: (cardId: string) => Promise<void>;
      setCurrentCardByType: (
        cardType: string,
      ) => Promise<{ topicId: string; cardId: string } | null>;
      getCardByType: (
        cardType: string,
      ) => Promise<{ topicId: string; cardId: string } | null>;
      openStudyPanel: () => void;
      getState: () => {
        activeCards: number;
        activeCrystals: number;
        unlockPoints: number;
        queuedCards: number;
        currentCardId: string | null;
      };
      getSM2: (cardId: string) => {
        cardId: string;
        interval: number;
        easeFactor: number;
        repetitions: number;
        nextReview: number;
      } | null;
      getXpTotal: () => number;
      getCrystalLevel: (topicId: string) => number | null;
      rateCurrentCard: (rating: 0 | 1 | 2 | 3) => void;
      getMiniGameContent: () => unknown | null;
      getMiniGameState: () => unknown | null;
      forceLevelUp: (topicId: string) => Promise<boolean>;
      triggerTrial: (topicId: string) => Promise<boolean>;
      submitTrialCorrect: (topicId: string) => Promise<unknown>;
      submitTrialWrong: (topicId: string) => Promise<unknown>;
      getTrialStatus: (topicId: string) => string | null;
      skipTrialCooldown: (topicId: string) => void;
    };
  }
}

// Export empty object to make this a module
export {};
