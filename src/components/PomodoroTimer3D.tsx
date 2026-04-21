import React, { useEffect, useMemo, useRef } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

import { playTimerFinishedSound } from '../utils/sound';
import { formatPomodoroRemaining, pomodoroStore } from '../features/pomodoro';
import { Button } from '@/components/ui/button';

export const PomodoroTimerOverlay: React.FC = () => {
  const remainingMs = pomodoroStore((state) => state.remainingMs);
  const isRunning = pomodoroStore((state) => state.isRunning);
  const phaseCompleted = pomodoroStore((state) => state.phaseCompleted);
  const start = pomodoroStore((state) => state.start);
  const pause = pomodoroStore((state) => state.pause);
  const resume = pomodoroStore((state) => state.resume);
  const reset = pomodoroStore((state) => state.reset);
  const tick = pomodoroStore((state) => state.tick);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) {
      return;
    }
    start();
    hasStarted.current = true;
  }, [start]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      tick();
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [tick]);

  const timerText = useMemo(
    () => formatPomodoroRemaining(remainingMs),
    [remainingMs],
  );

  useEffect(() => {
    if (!phaseCompleted) {
      return;
    }
    playTimerFinishedSound();
  }, [phaseCompleted]);

  return (
    <div
      className="h-7 flex items-center gap-1 rounded-lg border border-surface-hud-border bg-surface-hud px-2 py-1"
      aria-live="polite"
    >
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        onClick={reset}
        aria-label="Reset timer"
      >
        <RotateCcw />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        onClick={() => {
          if (isRunning) {
            pause()
          } else {
            resume()
          }
        }}
        aria-label={isRunning ? 'Pause timer' : 'Resume timer'}
      >
        {isRunning ? <Pause /> : <Play />}
      </Button>
      <span className="mr-0.5 h-4 w-px bg-border/60" aria-hidden="true" />
      <span className="font-mono tabular-nums text-xs">{timerText}</span>

    </div>
  );
};

export default PomodoroTimerOverlay;
