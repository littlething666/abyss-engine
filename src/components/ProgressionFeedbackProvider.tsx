 'use client';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { getRandomXPMessage } from '@/features/progression/feedbackMessages';
import { playPositiveSound } from '@/utils/sound';
import {
  type ProgressionEventMap,
  type ProgressionEventPayload,
  type ProgressionEventType,
} from '@/features/progression/events';

const EVENT_PREFIX = 'abyss-progression-';

const HISTORY_MESSAGE: Record<'undo' | 'redo', string> = {
  undo: 'Undo complete.',
  redo: 'Redo complete.',
};

export function ProgressionFeedbackProvider() {
  useEffect(() => {
    const eventTypes: ProgressionEventType[] = [
      'study-panel-history',
      'xp-gained',
      'session-complete',
      'level-up',
    ];

    const handleProgressionEvent = (event: Event) => {
      const payload = (event as CustomEvent).detail as ProgressionEventMap[keyof ProgressionEventMap];
      const eventType = event.type.replace(EVENT_PREFIX, '') as ProgressionEventType;

      switch (eventType) {
        case 'study-panel-history': {
          const historyPayload = payload as ProgressionEventPayload<'study-panel-history'>;
          if (historyPayload.action === 'undo' || historyPayload.action === 'redo') {
            toast.success(
              `${HISTORY_MESSAGE[historyPayload.action]} ${historyPayload.undoCount ?? 0} undo • ${historyPayload.redoCount ?? 0} redo available.`,
            );
          }
          break;
        }
        case 'xp-gained': {
          const xpPayload = payload as ProgressionEventPayload<'xp-gained'>;
          const baseMessage = getRandomXPMessage(xpPayload.rating);
          const toastMessage = xpPayload.amount > 0 ? `${baseMessage} +${xpPayload.amount} XP` : baseMessage;
          toast.success(toastMessage, { duration: 1500 });
          if (xpPayload.amount > 0) {
            playPositiveSound();
          }
          break;
        }
        case 'session-complete': {
          const sessionPayload = payload as ProgressionEventPayload<'session-complete'>;
          toast.success(
            `Session complete: ${sessionPayload.totalAttempts} attempt${sessionPayload.totalAttempts === 1 ? '' : 's'}.`,
            { duration: 2000 },
          );
          break;
        }
        case 'level-up': {
          break;
        }
      }
    };

    eventTypes.forEach((eventType) => {
      window.addEventListener(`${EVENT_PREFIX}${eventType}`, handleProgressionEvent as EventListener);
    });

    return () => {
      eventTypes.forEach((eventType) => {
        window.removeEventListener(`${EVENT_PREFIX}${eventType}`, handleProgressionEvent as EventListener);
      });
    };
  }, []);

  return null;
}
