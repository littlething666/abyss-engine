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
      className="fixed bottom-3 left-3 z-20 flex items-center gap-1 rounded-lg border border-cyan-300/40 bg-[#070b16]/80 px-2 py-1.5 text-[11px] font-medium shadow-[0_0_0_1px_rgba(125,211,252,0.25)] backdrop-blur-sm"
      aria-live="polite"
    >
      <span className="font-mono tabular-nums text-cyan-200">{timerText}</span>
      <span className="mx-1 h-4 w-px bg-cyan-400/40" aria-hidden="true" />
      <Button
        type="button"
        size="icon-xs"
        variant="outline"
        onClick={() => {
          if (isRunning) {
            pause();
          } else {
            resume();
          }
        }}
        className="ml-1 h-6 w-6 border-cyan-300/40 bg-slate-950/60 text-cyan-200 hover:bg-slate-900/70"
        aria-label={isRunning ? 'Pause timer' : 'Resume timer'}
      >
        {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="outline"
        onClick={reset}
        className="h-6 w-6 border-cyan-300/40 bg-slate-950/60 text-cyan-200 hover:bg-slate-900/70"
        aria-label="Reset timer"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
      <span className="sr-only" aria-live="polite">Timer continues in background</span>
    </div>
  );
};

export default PomodoroTimerOverlay;
