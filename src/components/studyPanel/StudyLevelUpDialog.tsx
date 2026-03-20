'use client';

import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

import type { StudyLevelUpCelebration } from '@/types/progression';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StudyLevelUpXpBar } from './StudyLevelUpXpBar';
import { playLevelUpSound } from '@/utils/sound';

export interface StudyLevelUpDialogProps {
  open: boolean;
  celebration: StudyLevelUpCelebration | null;
  topicDisplayName: string;
  onDismiss: () => void;
}

export function StudyLevelUpDialog({
  open,
  celebration,
  topicDisplayName,
  onDismiss,
}: StudyLevelUpDialogProps) {
  useEffect(() => {
    if (open && celebration) {
      playLevelUpSound();
    }
  }, [open, celebration?.sessionId, celebration?.newLevel]);

  if (!celebration) {
    return null;
  }

  const n = celebration.unlockPointsGained;
  const unlockLine =
    n === 1 ? '+1 unlock point from this card' : `+${n} unlock points from this card`;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onDismiss();
        }
      }}
    >
      <DialogContent
        data-testid="study-level-up-dialog"
        showCloseButton={false}
        overlayClassName="z-[60]"
        className="z-[70] flex w-full max-w-md flex-col gap-0 overflow-hidden p-6 sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        aria-describedby="study-level-up-description"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Level up</DialogTitle>
          <DialogDescription id="study-level-up-description">
            Growth tier increased. Use Continue studying to return to your session.
          </DialogDescription>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="relative flex flex-col items-center text-center"
        >
          <motion.div
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/25 blur-2xl"
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.65, 0.4] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          />

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
            <p className="text-center text-sm text-foreground">{unlockLine}</p>

            <StudyLevelUpXpBar
              fromXp={celebration.previousXp}
              toXp={celebration.finalXp}
              animationKey={celebration.sessionId}
            />
          </div>

          <Button
            type="button"
            className="mt-6 min-h-11 w-full"
            onClick={onDismiss}
            data-testid="study-level-up-continue"
          >
            Continue studying
          </Button>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
