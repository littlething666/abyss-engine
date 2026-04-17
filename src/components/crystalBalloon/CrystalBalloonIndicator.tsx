'use client';

import React, { createContext, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/webgpu';
import * as THREE from 'three/webgpu';
import { float, uniform, vec3 } from 'three/tsl';

/**
 * Shared opacity uniform provided by {@link CrystalBalloonIndicator} so glyph
 * materials rendered as balloon children fade in lockstep with the balloon.
 *
 * Glyphs MUST throw when this context is missing — see CLAUDE.md "Explicit Failure".
 */
export type BalloonOpacityUniform = ReturnType<typeof uniform>;

export const BalloonOpacityContext = createContext<BalloonOpacityUniform | null>(null);

interface BubbleDims {
  width: number;
  height: number;
  cornerRadius: number;
  tailWidth: number;
  tailHeight: number;
}

/**
 * Builds a ShapeGeometry for a speech-bubble: a rounded rectangle body with a
 * downward tail whose tip sits at local origin (0, 0, 0). The body therefore
 * extends upward in +Y space, so a parent group positioned at the tail-tip
 * anchor (typically just above the crystal) renders the balloon floating above.
 */
function createBubbleGeometry({
  width,
  height,
  cornerRadius: r,
  tailWidth,
  tailHeight,
}: BubbleDims): THREE.ShapeGeometry {
  const hw = width / 2;
  const yBody = tailHeight;
  const yTop = yBody + height;

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, yBody);
  shape.lineTo(-tailWidth / 2, yBody);
  shape.lineTo(0, 0);
  shape.lineTo(tailWidth / 2, yBody);
  shape.lineTo(hw - r, yBody);
  shape.quadraticCurveTo(hw, yBody, hw, yBody + r);
  shape.lineTo(hw, yTop - r);
  shape.quadraticCurveTo(hw, yTop, hw - r, yTop);
  shape.lineTo(-hw + r, yTop);
  shape.quadraticCurveTo(-hw, yTop, -hw, yTop - r);
  shape.lineTo(-hw, yBody + r);
  shape.quadraticCurveTo(-hw, yBody, -hw + r, yBody);

  return new THREE.ShapeGeometry(shape);
}

const BORDER_THICKNESS = 0.014;

const BORDER_DIMS: BubbleDims = {
  width: 0.46,
  height: 0.30,
  cornerRadius: 0.08,
  tailWidth: 0.12,
  tailHeight: 0.08,
};

const FILL_DIMS: BubbleDims = {
  width: BORDER_DIMS.width - BORDER_THICKNESS * 2,
  height: BORDER_DIMS.height - BORDER_THICKNESS * 2,
  cornerRadius: Math.max(0.02, BORDER_DIMS.cornerRadius - BORDER_THICKNESS),
  tailWidth: Math.max(0.04, BORDER_DIMS.tailWidth - BORDER_THICKNESS * 2),
  tailHeight: Math.max(0.04, BORDER_DIMS.tailHeight - BORDER_THICKNESS),
};

const BORDER_GEOMETRY = createBubbleGeometry(BORDER_DIMS);
const FILL_GEOMETRY = createBubbleGeometry(FILL_DIMS);
FILL_GEOMETRY.translate(0, BORDER_THICKNESS, 0);

/** Local-space center of the balloon body — used to place child glyphs. */
const BALLOON_BODY_CENTER_Y =
  BORDER_DIMS.tailHeight + BORDER_DIMS.height / 2;

/** Z offsets keep border behind fill behind glyphs on the same billboard plane. */
const BORDER_Z_OFFSET = 0;
const FILL_Z_OFFSET = 0.0005;
const GLYPH_Z_OFFSET = 0.001;

const BALLOON_BODY_CENTER_OFFSET: [number, number, number] = [
  0,
  BALLOON_BODY_CENTER_Y,
  GLYPH_Z_OFFSET,
];

const BORDER_POSITION: [number, number, number] = [0, 0, BORDER_Z_OFFSET];
const FILL_POSITION: [number, number, number] = [0, 0, FILL_Z_OFFSET];

const BALLOON_BORDER_OPACITY = 0.2;
const BALLOON_FILL_OPACITY = 0.2;
const GLYPH_OPACITY = 1.0;
const BALLOON_FILL_ALPHA = BALLOON_FILL_OPACITY;
const FADE_SPEED = 4;
const MIN_DELTA_CLAMP_S = 1 / 20;

export interface CrystalBalloonIndicatorColorRgb {
  r: number;
  g: number;
  b: number;
}

export interface CrystalBalloonIndicatorProps {
  /** World position of the balloon's tail tip (typically just above the crystal). */
  position: [number, number, number];
  /** While true the balloon fades in and stays visible; while false it fades out. */
  active: boolean;
  /** Called once when the fade-out reaches ~0 opacity so the parent can unmount. */
  onFadeOutComplete?: () => void;
  /** Rim color of the balloon. */
  borderColor?: Readonly<CrystalBalloonIndicatorColorRgb>;
  /** Body fill color of the balloon. Pre-multiplied by {@link BALLOON_FILL_ALPHA}. */
  fillColor?: Readonly<CrystalBalloonIndicatorColorRgb>;
  /** Glyph rendered inside the balloon body (centered). */
  children?: React.ReactNode;
}

const DEFAULT_BORDER_COLOR: Readonly<CrystalBalloonIndicatorColorRgb> = {
  r: 0.55,
  g: 0.95,
  b: 1.0,
};
const DEFAULT_FILL_COLOR: Readonly<CrystalBalloonIndicatorColorRgb> = {
  r: 0.05,
  g: 0.09,
  b: 0.14,
};

function createBalloonMaterials(
  borderOpacityUniform: BalloonOpacityUniform,
  fillOpacityUniform: BalloonOpacityUniform,
  borderColor: Readonly<CrystalBalloonIndicatorColorRgb>,
  fillColor: Readonly<CrystalBalloonIndicatorColorRgb>,
) {
  const borderMat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  borderMat.colorNode = vec3(
    float(borderColor.r),
    float(borderColor.g),
    float(borderColor.b),
  );
  borderMat.opacityNode = borderOpacityUniform;

  const fillMat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  fillMat.colorNode = vec3(
    float(fillColor.r),
    float(fillColor.g),
    float(fillColor.b),
  );
  fillMat.opacityNode = fillOpacityUniform;

  return { borderMat, fillMat };
}

/**
 * 3D speech-balloon indicator rendered above an anchor point (e.g. a crystal).
 *
 * Responsibilities:
 *  - Renders a rounded-rectangle body with a downward tail pointing at `position`.
 *  - Billboards to face the camera every frame.
 *  - Fades in when `active=true` and out when `active=false`; invokes
 *    `onFadeOutComplete` exactly once after reaching ~0 opacity during a fade-out.
 *  - Shares an opacity uniform with child glyph materials via
 *    {@link BalloonOpacityContext} so they fade in lockstep.
 *
 * Per CLAUDE.md WebGPU Strictness: uses `MeshBasicNodeMaterial` + TSL exclusively.
 */
export const CrystalBalloonIndicator: React.FC<CrystalBalloonIndicatorProps> = ({
  position,
  active,
  onFadeOutComplete,
  borderColor = DEFAULT_BORDER_COLOR,
  fillColor = DEFAULT_FILL_COLOR,
  children,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const opacityRef = useRef(0);
  const fadeOutNotifiedRef = useRef(false);

  const opacityUniform = useMemo<BalloonOpacityUniform>(() => uniform(0), []);
  const borderOpacityUniform = useMemo<BalloonOpacityUniform>(() => uniform(0), []);
  const fillOpacityUniform = useMemo<BalloonOpacityUniform>(() => uniform(0), []);

  const { borderMat, fillMat } = useMemo(
    () =>
      createBalloonMaterials(
        borderOpacityUniform,
        fillOpacityUniform,
        borderColor,
        fillColor,
      ),
    [borderOpacityUniform, fillOpacityUniform, borderColor, fillColor],
  );

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, MIN_DELTA_CLAMP_S);

    if (active) {
      fadeOutNotifiedRef.current = false;
    }

    const target = active ? 1 : 0;
    const current = opacityRef.current;
    const next =
      Math.abs(current - target) < 0.001
        ? target
        : THREE.MathUtils.lerp(current, target, 1 - Math.exp(-FADE_SPEED * dt));
    opacityRef.current = next;
    opacityUniform.value = next * GLYPH_OPACITY;
    borderOpacityUniform.value = next * BALLOON_BORDER_OPACITY;
    fillOpacityUniform.value = next * BALLOON_FILL_ALPHA;

    const group = groupRef.current;
    if (group) {
      const visible = next > 0.01;
      group.visible = visible;
      if (visible) {
        group.quaternion.copy(camera.quaternion);
      }
    }

    if (
      !active &&
      next <= 0.001 &&
      !fadeOutNotifiedRef.current &&
      onFadeOutComplete
    ) {
      fadeOutNotifiedRef.current = true;
      onFadeOutComplete();
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <BalloonOpacityContext.Provider value={opacityUniform}>
        <mesh
          geometry={BORDER_GEOMETRY}
          material={borderMat}
          position={BORDER_POSITION}
          renderOrder={0}
        />
        <mesh
          geometry={FILL_GEOMETRY}
          material={fillMat}
          position={FILL_POSITION}
          renderOrder={1}
        />
        <group position={BALLOON_BODY_CENTER_OFFSET}>{children}</group>
      </BalloonOpacityContext.Provider>
    </group>
  );
};

export default CrystalBalloonIndicator;
