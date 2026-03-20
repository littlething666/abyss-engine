'use client';

import { useEffect } from 'react';

import { type ProgressionEventPayload, type ProgressionEventType } from '../progression/events';
import { telemetry } from './index';

type ProgressionEventPayloadRecord = ProgressionEventPayload<ProgressionEventType>;

const PREFIX = 'abyss-progression-';

function toNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function toString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function TelemetryProvider() {
  useEffect(() => {
    const eventTypes: ProgressionEventType[] = [
      'study-panel-history',
      'xp-gained',
      'session-complete',
      'level-up',
    ];

    const handleProgressionEvent = (event: Event) => {
      const eventType = event.type.replace(PREFIX, '');
      const detail = (event as CustomEvent).detail as ProgressionEventPayloadRecord | undefined;
      if (!detail) {
        return;
      }

      if (eventType === 'study-panel-history') {
        const topicId = toString((detail as { topicId?: unknown }).topicId);
        const sessionId = toString((detail as { sessionId?: unknown }).sessionId);
        if ((detail as { action?: string }).action === 'submit') {
          telemetry.log('study_session_start', {
            sessionId: sessionId || `legacy-${Date.now()}`,
            topicId: topicId || 'unknown-topic',
          }, {
            sessionId,
            topicId,
          });
        }

        if ((detail as { action?: string }).action === 'undo') {
          telemetry.log('study_undo', {
            topicId: topicId || 'unknown-topic',
            sessionId: sessionId || `legacy-${Date.now()}`,
            undoCount: toNumber((detail as { undoCount?: unknown }).undoCount, 0),
            redoCount: toNumber((detail as { redoCount?: unknown }).redoCount, 0),
          }, {
            sessionId,
            topicId,
          });
        }

        if ((detail as { action?: string }).action === 'redo') {
          telemetry.log('study_redo', {
            topicId: topicId || 'unknown-topic',
            sessionId: sessionId || `legacy-${Date.now()}`,
            undoCount: toNumber((detail as { undoCount?: unknown }).undoCount, 0),
            redoCount: toNumber((detail as { redoCount?: unknown }).redoCount, 0),
          }, {
            sessionId,
            topicId,
          });
        }

        return;
      }

      if (eventType === 'xp-gained') {
        telemetry.log('study_card_reviewed', {
          cardId: toString((detail as { cardId?: unknown }).cardId),
          rating: toNumber((detail as { rating?: unknown }).rating, 1) as 1 | 2 | 3 | 4,
          isCorrect: Boolean((detail as { isCorrect?: unknown })?.isCorrect),
          difficulty: toNumber((detail as { difficulty?: unknown }).difficulty, 1),
          timeTakenMs: toNumber((detail as { timeTakenMs?: unknown }).timeTakenMs, 0),
          buffMultiplier: toNumber((detail as { buffMultiplier?: unknown }).buffMultiplier, 1),
        }, {
          topicId: toString((detail as { topicId?: unknown }).topicId),
          sessionId: toString((detail as { sessionId?: unknown }).sessionId) || null,
        });
        telemetry.log('xp_gained', {
          amount: toNumber((detail as { amount?: unknown }).amount, 0),
          topicId: toString((detail as { topicId?: unknown }).topicId),
          sessionId: toString((detail as { sessionId?: unknown }).sessionId) || 'legacy-session',
          cardId: toString((detail as { cardId?: unknown }).cardId),
        });
        return;
      }

      if (eventType === 'level-up') {
        telemetry.log('level_up', {
          topicId: toString((detail as { topicId?: unknown }).topicId),
          fromLevel: toNumber((detail as { fromLevel?: unknown }).fromLevel, 0),
          toLevel: toNumber((detail as { toLevel?: unknown }).toLevel, 0),
          sessionId: toString((detail as { sessionId?: unknown }).sessionId) || undefined,
          unlockPointsGained: toNumber((detail as { unlockPointsGained?: unknown }).unlockPointsGained, 0) || undefined,
          stepsCount: toNumber((detail as { stepsCount?: unknown }).stepsCount, 1) || undefined,
        }, {
          topicId: toString((detail as { topicId?: unknown }).topicId),
          sessionId: toString((detail as { sessionId?: unknown }).sessionId) || null,
        });
        return;
      }

      if (eventType === 'session-complete') {
        telemetry.log('study_session_complete', {
          sessionId: toString((detail as { sessionId?: unknown }).sessionId) || `legacy-${Date.now()}`,
          topicId: toString((detail as { topicId?: unknown }).topicId) || 'unknown-topic',
          totalAttempts: toNumber((detail as { totalAttempts?: unknown }).totalAttempts, 0),
          correctRate: toNumber((detail as { correctRate?: unknown }).correctRate, 0),
          sessionDurationMs: toNumber((detail as { sessionDurationMs?: unknown }).sessionDurationMs, 0),
        }, {
          topicId: toString((detail as { topicId?: unknown }).topicId),
          sessionId: toString((detail as { sessionId?: unknown }).sessionId) || null,
        });
      }
    };

    eventTypes.forEach((eventType) => {
      window.addEventListener(`${PREFIX}${eventType}`, handleProgressionEvent);
    });

    return () => {
      eventTypes.forEach((eventType) => {
        window.removeEventListener(`${PREFIX}${eventType}`, handleProgressionEvent);
      });
    };
  }, []);

  return null;
}
