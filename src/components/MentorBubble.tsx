'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';
import { Billboard } from '@react-three/drei/webgpu';
import {
  generationAttentionSurface,
  useContentGenerationStore,
} from '@/features/contentGeneration';
import { useShallow } from 'zustand/react/shallow';
import {
  selectMentorBubbleVisual,
  tryEnqueueMentorEntry,
  useMentorStore,
} from '../features/mentor';
import { useMentorEntryContext } from '../hooks/useMentorEntryContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { createMentorBubbleTexture } from '../graphics/labels/createMentorBubbleTexture';
import { createMentorBubbleMaterial } from '../graphics/labels/createMentorBubbleMaterial';
import { NEXUS_BOB_AMPLITUDE_LOCAL, NEXUS_CENTER_Y } from './WisdomAltar';
import {
  ACTIVE_HALO_OPACITY_HIGH,
  ACTIVE_HALO_OPACITY_LOW,
  ACTIVE_RING_OPACITY_HIGH,
  ACTIVE_RING_OPACITY_LOW,
  ALERT_PULSE_SCALE_AMPLITUDE,
  BUBBLE_VERTICAL_OFFSET_LOCAL,
  COLOR_CROSSFADE_SECONDS,
  GLYPH_RADIUS_LOCAL,
  HALO_RADIUS_LOCAL,
  HIT_TARGET_RADIUS_LOCAL,
  PULSE_FREQUENCY_HZ,
  PULSE_SCALE_AMPLITUDE,
  REDUCED_MOTION_HALO_OPACITY,
  RING_INNER_LOCAL,
  RING_OUTER_LOCAL,
} from './mentorBubbleConstants';

// Module-static geometries — matches the pattern used by WisdomAltar's ring.
const ringGeometry = new THREE.RingGeometry(RING_INNER_LOCAL, RING_OUTER_LOCAL, 32);
const glyphGeometry = new THREE.PlaneGeometry(
  GLYPH_RADIUS_LOCAL * 2,
  GLYPH_RADIUS_LOCAL * 2,
);
const haloGeometry = new THREE.PlaneGeometry(
  HALO_RADIUS_LOCAL * 2,
  HALO_RADIUS_LOCAL * 2,
);
const hitTargetGeometry = new THREE.CircleGeometry(HIT_TARGET_RADIUS_LOCAL, 24);

function stepColor(
  current: THREE.Color,
  target: THREE.Color,
  alpha: number,
): void {
  current.lerp(target, alpha);
}

/**
 * Floating mentor bubble — small WebGPU-safe billboard above the nexus that
 * renders a single, high-visibility glyph encoding mentor mood, generation
 * phase, or alert state. The visible plane is a colored ring + a glyph plane
 * + an additive halo plane, all backed by a transparent hit-target plane that
 * keeps mobile taps reliable.
 *
 * Visual state is computed by the pure selector `selectMentorBubbleVisual`,
 * which reads mentor mood, mentor activity, the active subject-graph phase,
 * and the unified primary failure surface. Animation timing (pulse,
 * reduced-motion clamps, color cross-fade) lives here.
 *
 * Click selection is delegated to `tryEnqueueMentorEntry(context)` so the
 * bubble and HUD Quick Actions "🗣️ Mentor" item share identical, contextual
 * semantics.
 */
export const MentorBubble: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const reducedMotion = useReducedMotion();

  const mood = useMentorStore((s) => {
    const head = s.currentDialog ?? s.dialogQueue[0] ?? null;
    return head?.messages[0]?.mood ?? null;
  });
  const hasMentorActivity = useMentorStore(
    (s) => s.currentDialog !== null || s.dialogQueue.length > 0,
  );
  const attention = useContentGenerationStore(useShallow(generationAttentionSurface));

  const visual = useMemo(
    () =>
      selectMentorBubbleVisual({
        mood,
        hasMentorActivity,
        subjectGraphActivePhase: attention.subjectGraphActivePhase,
        primaryFailure: attention.primaryFailure,
      }),
    [mood, hasMentorActivity, attention.subjectGraphActivePhase, attention.primaryFailure],
  );

  const entryContext = useMentorEntryContext();

  // Glyph alpha-mask texture is keyed by `iconName` alone; color comes from
  // uniforms and cross-fades smoothly when the resolved visual changes.
  const { texture: alphaMask } = useMemo(
    () => createMentorBubbleTexture(visual.iconName),
    [visual.iconName],
  );

  const handles = useMemo(
    () => createMentorBubbleMaterial(alphaMask),
    [alphaMask],
  );

  // Targets the useFrame driver cross-fades into. Updated synchronously on
  // visual changes; the actual uniform values lerp toward these targets.
  const targetGlyphColor = useMemo(
    () => new THREE.Color(visual.glyphColor),
    [visual.glyphColor],
  );
  const targetGlowColor = useMemo(
    () => new THREE.Color(visual.glowColor),
    [visual.glowColor],
  );
  const targetRingColor = useMemo(
    () => new THREE.Color(visual.ringColor),
    [visual.ringColor],
  );

  // Initialize uniforms to current targets on first mount so we don't fade
  // from a default white when the bubble first appears.
  useEffect(() => {
    handles.glyphColorUniform.value = targetGlyphColor.clone();
    handles.glowColorUniform.value = targetGlowColor.clone();
    handles.ringColorUniform.value = targetRingColor.clone();
    // Intentionally only on mount of these handles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handles]);

  // Dispose materials on unmount. Geometries are module-static.
  useEffect(
    () => () => {
      handles.glyphMaterial.dispose();
      handles.haloMaterial.dispose();
      handles.ringMaterial.dispose();
    },
    [handles],
  );

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const t = performance.now() / 1000;

    // Bob in lockstep with the nexus group.
    group.position.y =
      NEXUS_CENTER_Y +
      BUBBLE_VERTICAL_OFFSET_LOCAL +
      Math.sin(t * 0.8) * NEXUS_BOB_AMPLITUDE_LOCAL;

    // Color cross-fade: 0..1 fraction of crossfade per frame.
    const fadeAlpha = Math.min(1, delta / COLOR_CROSSFADE_SECONDS);
    stepColor(handles.glyphColorUniform.value as THREE.Color, targetGlyphColor, fadeAlpha);
    stepColor(handles.glowColorUniform.value as THREE.Color, targetGlowColor, fadeAlpha);
    stepColor(handles.ringColorUniform.value as THREE.Color, targetRingColor, fadeAlpha);

    // Scale + opacity envelope.
    if (visual.isAlert) {
      // Anti-flicker: opacity is fixed; urgency comes from base scale (+ optional
      // scale-only pulse when reduced motion is off).
      handles.ringOpacityUniform.value = visual.ringOpacity;
      handles.glowOpacityUniform.value = visual.haloOpacity;
      if (reducedMotion) {
        group.scale.setScalar(visual.baseScaleMultiplier);
      } else {
        const phase = t * PULSE_FREQUENCY_HZ * Math.PI * 2;
        group.scale.setScalar(
          visual.baseScaleMultiplier + Math.sin(phase) * ALERT_PULSE_SCALE_AMPLITUDE,
        );
      }
      return;
    }

    if (reducedMotion) {
      group.scale.setScalar(visual.baseScaleMultiplier);
      handles.ringOpacityUniform.value = visual.ringOpacity;
      handles.glowOpacityUniform.value = visual.isActive
        ? REDUCED_MOTION_HALO_OPACITY
        : visual.haloOpacity;
      return;
    }

    if (visual.isActive) {
      const phase = t * PULSE_FREQUENCY_HZ * Math.PI * 2;
      const pulse01 = 0.5 + 0.5 * Math.sin(phase);
      group.scale.setScalar(
        visual.baseScaleMultiplier + Math.sin(phase) * PULSE_SCALE_AMPLITUDE,
      );
      handles.ringOpacityUniform.value =
        ACTIVE_RING_OPACITY_LOW +
        (ACTIVE_RING_OPACITY_HIGH - ACTIVE_RING_OPACITY_LOW) * pulse01;
      handles.glowOpacityUniform.value =
        ACTIVE_HALO_OPACITY_LOW +
        (ACTIVE_HALO_OPACITY_HIGH - ACTIVE_HALO_OPACITY_LOW) * pulse01;
      return;
    }

    group.scale.setScalar(visual.baseScaleMultiplier);
    handles.ringOpacityUniform.value = visual.ringOpacity;
    handles.glowOpacityUniform.value = visual.haloOpacity;
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    tryEnqueueMentorEntry(entryContext);
  };
  const stop = (event: ThreeEvent<PointerEvent>) => event.stopPropagation();
  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = 'pointer';
  };
  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = 'auto';
  };

  return (
    <Billboard
      ref={groupRef}
      position={[0, NEXUS_CENTER_Y + BUBBLE_VERTICAL_OFFSET_LOCAL, 0]}
      onClick={handleClick}
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* Transparent hit-target plane — sized from RING_OUTER_LOCAL, decoupled from glyph size. */}
      <mesh geometry={hitTargetGeometry} renderOrder={0} visible={false} />
      {/* Halo plane — additive blur behind everything else. */}
      <mesh geometry={haloGeometry} renderOrder={1}>
        <primitive object={handles.haloMaterial} attach="material" />
      </mesh>
      {/* Ring — solid, mood-tinted. */}
      <mesh geometry={ringGeometry} renderOrder={2}>
        <primitive object={handles.ringMaterial} attach="material" />
      </mesh>
      {/* Glyph plane — alpha-mask textured, color from uniform. */}
      <mesh geometry={glyphGeometry} renderOrder={3}>
        <primitive object={handles.glyphMaterial} attach="material" />
      </mesh>
    </Billboard>
  );
};

export default MentorBubble;
