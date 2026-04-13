'use client';

import { useCallback, useEffect } from 'react';
import { useThree } from '@react-three/fiber/webgpu';

import { selectIsAnyModalOpen, useUIStore } from '../store/uiStore';

export interface SceneInvalidationController {
  invalidate: () => void;
  isPaused: boolean;
}

export function useSceneInvalidator(): SceneInvalidationController {
  const isAnyModalOpen = useUIStore(selectIsAnyModalOpen);
  const isPaused = isAnyModalOpen
  const invalidate = useThree((state) => state.invalidate);

  const requestFrame = useCallback(() => {
    if (isPaused) {
      return;
    }

    invalidate();
  }, [isPaused, invalidate]);

  useEffect(() => {
    if (!isPaused) {
      invalidate();
    }
  }, [isPaused, invalidate]);

  return {
    invalidate: requestFrame,
    isPaused,
  };
}
