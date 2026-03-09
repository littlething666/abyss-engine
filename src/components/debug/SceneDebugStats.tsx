'use client';

import React from 'react';
import { useSceneDebugStats } from './useSceneDebugStats';

interface SceneDebugStatsProps {
  onReport: (report: string) => void;
  sampleWindowMs?: number;
}

export const SceneDebugStats: React.FC<SceneDebugStatsProps> = ({ onReport, sampleWindowMs = 300 }) => {
  useSceneDebugStats(onReport, { sampleWindowMs });
  return null;
};

export default SceneDebugStats;
