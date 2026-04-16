'use client';

import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';

import type { EffectConfig, FeedbackTier, ParticleEffect } from '../../features/studyPanel/feedbackFx';
import { createEffectForTier, runEffectLoop, CANVAS_DPR_ATTR } from '../../features/studyPanel/feedbackFx';

export interface RatingFeedbackCanvasHandle {
  trigger: (tier: FeedbackTier, cardRect: DOMRect) => void;
}

interface RatingFeedbackCanvasProps {
  /** Ref to the container element the canvas should cover. */
  containerRef: React.RefObject<HTMLElement | null>;
}

/**
 * Fullscreen (relative to container) canvas overlay for rating feedback effects.
 * Renders with pointer-events: none so it never blocks interaction.
 */
export const RatingFeedbackCanvas = React.forwardRef<
  RatingFeedbackCanvasHandle,
  RatingFeedbackCanvasProps
>(function RatingFeedbackCanvas({ containerRef }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const effectsRef = useRef<ParticleEffect[]>([]);
  const disposeLoopRef = useRef<(() => void) | null>(null);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const logicalW = rect.width;
    const logicalH = rect.height;

    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;
    canvas.style.width = `${logicalW}px`;
    canvas.style.height = `${logicalH}px`;

    // Store the capped DPR so runEffectLoop can read it back consistently.
    canvas.setAttribute(CANVAS_DPR_ATTR, String(dpr));

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, [containerRef]);

  useEffect(() => {
    syncCanvasSize();
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [syncCanvasSize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (disposeLoopRef.current) {
        disposeLoopRef.current();
        disposeLoopRef.current = null;
      }
    };
  }, []);

  const startLoopIfNeeded = useCallback(() => {
    if (disposeLoopRef.current) return; // already running
    const canvas = canvasRef.current;
    if (!canvas) return;

    disposeLoopRef.current = runEffectLoop(
      canvas,
      () => {
        // Prune finished effects
        effectsRef.current = effectsRef.current.filter(
          (e) => e.elapsed < e.duration,
        );
        return effectsRef.current;
      },
      () => {
        // All effects done — stop loop, clear canvas
        if (disposeLoopRef.current) {
          disposeLoopRef.current();
          disposeLoopRef.current = null;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      },
    );
  }, []);

  const trigger = useCallback(
    (tier: FeedbackTier, cardDomRect: DOMRect) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      syncCanvasSize();

      const containerRect = container.getBoundingClientRect();
      const localRect = {
        x: cardDomRect.left - containerRect.left,
        y: cardDomRect.top - containerRect.top,
        width: cardDomRect.width,
        height: cardDomRect.height,
      };

      const config: EffectConfig = {
        tier,
        cardRect: localRect,
        canvasWidth: containerRect.width,
        canvasHeight: containerRect.height,
      };

      const effect = createEffectForTier(config);
      effectsRef.current.push(effect);
      startLoopIfNeeded();
    },
    [containerRef, syncCanvasSize, startLoopIfNeeded],
  );

  useImperativeHandle(ref, () => ({ trigger }), [trigger]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 pointer-events-none z-10"
      data-testid="rating-feedback-canvas"
    />
  );
});
