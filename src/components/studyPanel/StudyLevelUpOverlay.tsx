'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

import type { StudyLevelUpQueue } from '@/types/progression';
import { Button } from '@/components/ui/button';
import { StudyLevelUpXpBar } from './StudyLevelUpXpBar';
import { playLevelUpSound } from '@/utils/sound';

export interface StudyLevelUpOverlayProps {
  queue: StudyLevelUpQueue;
  topicDisplayName: string;
  totalUnlockPoints: number;
  onComplete: () => void;
}

export function StudyLevelUpOverlay({
  queue,
  topicDisplayName,
  totalUnlockPoints,
  onComplete,
}: StudyLevelUpOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = queue.steps[stepIndex];
  const isLast = stepIndex >= queue.steps.length - 1;
  const stepCount = queue.steps.length;

  useEffect(() => {
    playLevelUpSound();
  }, [stepIndex]);

  if (!step) {
    return null;
  }

  const handleContinue = () => {
    if (isLast) {
      onComplete();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-background/85 backdrop-blur-md"
      data-testid="study-level-up-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="study-level-up-title"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={`${queue.sessionId}-${stepIndex}`}
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -8 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border/80 bg-card p-6 shadow-2xl"
        >
          <motion.div
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/25 blur-2xl"
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.65, 0.4] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-secondary/20 blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.25, 0.5, 0.25] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />

          <div className="relative flex flex-col items-center text-center">
            <motion.div
              initial={{ rotate: -8, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}
              className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent/30 to-secondary/40 text-2xl shadow-lg"
            >
              <Sparkles className="h-7 w-7 text-amber-300" aria-hidden />
            </motion.div>

            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {stepCount > 1 ? `Tier up ${stepIndex + 1} / ${stepCount}` : 'Tier up'}
            </p>
            <h2
              id="study-level-up-title"
              className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
            >
              Growth tier {step.newLevel}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
              <span className="font-medium text-foreground">{topicDisplayName}</span>
              {' · '}
              crystal attuned deeper
            </p>

            <div className="mt-5 w-full space-y-4">
              <div className="rounded-xl border border-border/60 bg-background/50 px-4 py-3 text-left">
                <p className="text-xs text-muted-foreground">Unlock points (total)</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{totalUnlockPoints}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  +{step.unlockPointsDelta} from this tier
                </p>
              </div>

              <StudyLevelUpXpBar
                fromXp={step.xpBeforeStep}
                toXp={step.crystalXpAfterStep}
                animationKey={stepIndex}
              />
            </div>

            <Button
              type="button"
              className="mt-6 w-full min-h-11"
              onClick={handleContinue}
              data-testid="study-level-up-continue"
            >
              {isLast ? 'Continue studying' : 'Next tier'}
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
