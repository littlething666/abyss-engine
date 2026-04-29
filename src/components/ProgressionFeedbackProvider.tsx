'use client';

import { useEffect } from 'react';
import { toast } from '@/infrastructure/toast';

import { appEventBus } from '@/infrastructure/eventBus';
import { getRandomXPMessage } from '@/features/progression/feedbackMessages';
import { playPositiveSound } from '@/utils/sound';

export function ProgressionFeedbackProvider() {
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      appEventBus.on('card:reviewed', (e) => {
        const baseMessage = getRandomXPMessage(e.rating);
        const toastMessage = e.buffedReward > 0 ? `${baseMessage} +${e.buffedReward} XP` : baseMessage;
        toast.success(toastMessage, { duration: 1500 });
        if (e.buffedReward > 0) {
          playPositiveSound();
        }
      }),
    );

    unsubs.push(
      appEventBus.on('xp:gained', (e) => {
        if (e.amount > 0) {
          toast.success(`XP adjusted: +${e.amount}`, { duration: 1500 });
          playPositiveSound();
        }
      }),
    );

    unsubs.push(
      appEventBus.on('crystal:leveled', (e) => {
        if (e.levelsGained === 1) {
          toast.success(`Crystal reached level ${e.to}!`, { duration: 2200 });
        } else {
          toast.success(`Crystal leveled up ${e.levelsGained} times! Now level ${e.to}.`, { duration: 2200 });
        }
      }),
    );

    unsubs.push(
      appEventBus.on('session:completed', (e) => {
        toast.success(
          `Session complete: ${e.totalAttempts} attempt${e.totalAttempts === 1 ? '' : 's'}.`,
          { duration: 2000 },
        );
      }),
    );

    unsubs.push(
      appEventBus.on('study-panel:history-applied', (e) => {
        if (e.action === 'undo' || e.action === 'redo') {
          const label = e.action === 'undo' ? 'Undo complete.' : 'Redo complete.';
          toast.success(`${label} ${e.undoCount} undo • ${e.redoCount} redo available.`);
        }
      }),
    );

    return () => unsubs.forEach((fn) => fn());
  }, []);

  return null;
}
