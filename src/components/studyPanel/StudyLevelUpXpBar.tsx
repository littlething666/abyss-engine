'use client';

import React, { useEffect, useState } from 'react';
import { animate } from 'motion/react';

import { calculateLevelFromXP, getXpTierLabel, getXpTierProgress01 } from '@/features/progression';

export interface StudyLevelUpXpBarProps {
  fromXp: number;
  toXp: number;
  /** Bump when the step changes so the animation restarts. */
  animationKey: number;
  className?: string;
}

export function StudyLevelUpXpBar({ fromXp, toXp, animationKey, className }: StudyLevelUpXpBarProps) {
  const [displayXp, setDisplayXp] = useState(fromXp);

  useEffect(() => {
    setDisplayXp(fromXp);
    const controls = animate(fromXp, toXp, {
      type: 'spring',
      stiffness: 120,
      damping: 22,
      mass: 0.85,
      onUpdate: (latest) => setDisplayXp(latest),
    });
    return () => controls.stop();
  }, [fromXp, toXp, animationKey]);

  const tier = calculateLevelFromXP(displayXp);
  const progress = getXpTierProgress01(displayXp);

  return (
    <div className={className} data-testid="study-level-up-xp-bar">
      <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
        <span>{getXpTierLabel(tier)}</span>
        <span className="tabular-nums font-medium text-foreground">{Math.round(displayXp)} XP</span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-muted border border-border/60"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-secondary shadow-[0_0_12px_rgba(250,204,21,0.35)]"
          style={{ width: `${Math.round(progress * 1000) / 10}%` }}
        />
      </div>
    </div>
  );
}
