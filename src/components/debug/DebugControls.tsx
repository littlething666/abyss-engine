'use client';

import React, { useEffect } from 'react';
import { Leva, useControls } from 'leva';

interface DebugControlsProps {
  onShowStatsChange: (showStats: boolean) => void;
  onCameraAngleUnlockChange: (isUnlocked: boolean) => void;
  defaultCameraAngleUnlocked?: boolean;
}

const DebugControls = ({
  onShowStatsChange,
  onCameraAngleUnlockChange,
  defaultCameraAngleUnlocked = false,
}: DebugControlsProps) => {
  const { showStats, unlockCameraAngles } = useControls({
    showStats: true,
    unlockCameraAngles: defaultCameraAngleUnlocked,
  });

  useEffect(() => {
    onShowStatsChange(showStats);
  }, [showStats, onShowStatsChange]);

  useEffect(() => {
    onCameraAngleUnlockChange(unlockCameraAngles);
  }, [unlockCameraAngles, onCameraAngleUnlockChange]);

  return <Leva collapsed />;
};

export default DebugControls;
