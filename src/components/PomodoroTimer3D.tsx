import React, { useEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei/webgpu';

import { useSceneInvalidator } from '../hooks/useSceneInvalidator';
import { useUIStore } from '../store/uiStore';
import { playTimerFinishedSound } from '../utils/sound';
import { formatPomodoroRemaining, pomodoroStore } from '../features/pomodoro';
import { GRID_SIZE } from './Grid';

const TIMER_CORNER_OFFSET = 0.72;
const TIMER_HEIGHT = 2.45;

export const PomodoroTimer3D: React.FC = () => {
  const remainingMs = pomodoroStore((state) => state.remainingMs);
  const isRunning = pomodoroStore((state) => state.isRunning);
  const phaseCompleted = pomodoroStore((state) => state.phaseCompleted);
  const start = pomodoroStore((state) => state.start);
  const pause = pomodoroStore((state) => state.pause);
  const resume = pomodoroStore((state) => state.resume);
  const reset = pomodoroStore((state) => state.reset);
  const tick = pomodoroStore((state) => state.tick);
  const { invalidate, isPaused } = useSceneInvalidator();
  const isAnyModalOpen = useUIStore((state) => state.isAnyModalOpen);
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
      if (isPaused) {
        return;
      }
      tick();
      invalidate();
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [tick, isPaused, invalidate]);

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

  const position: [number, number, number] = useMemo(
    () => [
      GRID_SIZE / 2 - TIMER_CORNER_OFFSET,
      TIMER_HEIGHT,
      -GRID_SIZE / 2 + TIMER_CORNER_OFFSET,
    ],
    [],
  );

  return (
    <Html
      position={position}
      center
      transform
      sprite
      zIndexRange={isAnyModalOpen ? [-1, 0] : [0, 0]}
      style={{
        color: '#7dd3fc',
        fontFamily: 'monospace',
        fontWeight: 600,
        fontSize: '28px',
        letterSpacing: '0.08em',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px',
        textAlign: 'right',
        background: 'rgba(8, 15, 26, 0.55)',
        border: '1px solid rgba(125, 211, 252, 0.3)',
        borderRadius: '8px',
        padding: '8px 10px',
        pointerEvents: isAnyModalOpen ? 'none' : 'auto',
        zIndex: isAnyModalOpen ? -1 : 0,
      }}
    >
      <div>{timerText}</div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => {
            if (isRunning) {
              pause();
            } else {
              resume();
            }
          }}
          style={buttonStyle}
          aria-label={isRunning ? 'Pause timer' : 'Resume timer'}
        >
          {isRunning ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          onClick={reset}
          style={buttonStyle}
          aria-label="Reset timer"
        >
          ⟲
        </button>
      </div>
    </Html>
  );
};

const buttonStyle: React.CSSProperties = {
  border: '1px solid rgba(125, 211, 252, 0.5)',
  borderRadius: '999px',
  background: 'rgba(15, 23, 42, 0.7)',
  color: '#7dd3fc',
  width: '30px',
  height: '30px',
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  lineHeight: '28px',
  textAlign: 'center',
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontSize: '16px',
  fontWeight: 600,
};

export default PomodoroTimer3D;
