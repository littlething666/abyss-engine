import { useRef } from 'react';
import { useFrame } from '@react-three/fiber/webgpu';
import { useSceneInvalidator } from '../../hooks/useSceneInvalidator';

export interface SceneDebugStatsSnapshot {
  fps: number;
  calls: number;
  triangles: number;
}

interface RenderInfoCarrier {
  info?: {
    render?: {
      calls?: number;
      triangles?: number;
    };
  };
}

interface UseSceneDebugStatsOptions {
  sampleWindowMs?: number;
  enabled?: boolean;
}

const DEFAULT_SAMPLE_WINDOW_MS = 300;

const formatSnapshot = (snapshot: SceneDebugStatsSnapshot) => {
  return `FPS: ${snapshot.fps.toFixed(1)} | Calls: ${snapshot.calls.toLocaleString()} | Triangles: ${snapshot.triangles.toLocaleString()}`;
};

export { formatSnapshot as formatSceneDebugStats };

export function useSceneDebugStats(
  onReport: (report: string) => void,
  options: UseSceneDebugStatsOptions = {},
) {
  const { enabled = true } = options;
  const { isPaused } = useSceneInvalidator();
  const sampleWindowMs = useRef(options.sampleWindowMs ?? DEFAULT_SAMPLE_WINDOW_MS);
  const state = useRef({
    lastSampleTime: performance.now(),
    frameCount: 0,
  });

  sampleWindowMs.current = options.sampleWindowMs ?? DEFAULT_SAMPLE_WINDOW_MS;

  useFrame(
    ({ gl }) => {
      if (isPaused) {
        return;
      }

      if (!enabled) {
        state.current.lastSampleTime = performance.now();
        state.current.frameCount = 0;
        return;
      }

      state.current.frameCount += 1;
      const now = performance.now();
      const elapsed = now - state.current.lastSampleTime;

      if (elapsed < sampleWindowMs.current) {
        return;
      }

      const renderStats = (gl as RenderInfoCarrier).info?.render;
      const snapshot: SceneDebugStatsSnapshot = {
        fps: (state.current.frameCount * 1000) / elapsed,
        calls: renderStats?.calls ?? 0,
        triangles: renderStats?.triangles ?? 0,
      };

      state.current.lastSampleTime = now;
      state.current.frameCount = 0;

      if ((gl.info as { render?: { calls?: number; triangles?: number } }).render) {
        gl.info.reset();
      }

      onReport(formatSnapshot(snapshot));
    },
    { phase: 'finish' },
  );
}
