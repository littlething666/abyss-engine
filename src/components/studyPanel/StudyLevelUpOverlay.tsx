'use client';

import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

import type { StudyLevelUpCelebration } from '@/types/progression';
import { Button } from '@/components/ui/button';
import { StudyLevelUpXpBar } from './StudyLevelUpXpBar';
import { playLevelUpSound } from '@/utils/sound';

export interface StudyLevelUpOverlayProps {
  celebration: StudyLevelUpCelebration;
  topicDisplayName: string;
  onComplete: () => void;
}

export function StudyLevelUpOverlay({
  celebration,
  topicDisplayName,
  onComplete,
}: StudyLevelUpOverlayProps) {
  useEffect(() => {
    playLevelUpSound();
  }, []);

  const n = celebration.unlockPointsGained;
  const unlockLine =
    n === 1 ? '+1 unlock point from this card' : `+${n} unlock points from this card`;

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-background/85 backdrop-blur-md"
      data-testid="study-level-up-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="study-level-up-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border/80 bg-card p-6 shadow-2xl"
      >
        <motion.div
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/25 blur-2xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.65, 0.4] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
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

          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Tier up</p>
          <h2
            id="study-level-up-title"
            className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            Growth tier {celebration.newLevel}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
            <span className="font-medium text-foreground">{topicDisplayName}</span>
            {' · '}
            crystal attuned deeper
          </p>

          <div className="mt-5 w-full space-y-4">
            <p className="text-sm text-foreground text-center">{unlockLine}</p>

            <StudyLevelUpXpBar
              fromXp={celebration.previousXp}
              toXp={celebration.finalXp}
              animationKey={celebration.sessionId}
            />
          </div>

          <Button
            type="button"
            className="mt-6 w-full min-h-11"
            onClick={onComplete}
            data-testid="study-level-up-continue"
          >
            Continue studying
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
