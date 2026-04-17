'use client';

import React from 'react';

import {
  CrystalBalloonIndicator,
  TrialGlyph,
  type CrystalBalloonIndicatorColorRgb,
} from './crystalBalloon';

interface CrystalTrialGeneratingIndicatorProps {
  position: [number, number, number];
  /** When false the indicator fades out smoothly; true fades in (or stays visible). */
  active: boolean;
  /** Called once when the fade-out reaches zero opacity. */
  onFadeOutComplete?: () => void;
}

const BORDER_COLOR: Readonly<CrystalBalloonIndicatorColorRgb> = {
  r: 1.0,
  g: 0.78,
  b: 0.34,
};
const FILL_COLOR: Readonly<CrystalBalloonIndicatorColorRgb> = {
  r: 0.12,
  g: 0.07,
  b: 0.03,
};

/**
 * Balloon-style indicator rendered above a crystal while its Crystal Trial
 * scenario questions are being pregenerated (trial status `pregeneration`).
 *
 * Thin wrapper around {@link CrystalBalloonIndicator} that supplies the
 * trial-ritual glyph (a spinning 4-pointed star) and the warm amber tint
 * conventionally used for trial / challenge surfaces across the app — keeping
 * the trial-pregeneration signal visually distinct from the cool-cyan
 * content-generation indicator.
 */
export const CrystalTrialGeneratingIndicator: React.FC<
  CrystalTrialGeneratingIndicatorProps
> = ({ position, active, onFadeOutComplete }) => (
  <CrystalBalloonIndicator
    position={position}
    active={active}
    onFadeOutComplete={onFadeOutComplete}
    borderColor={BORDER_COLOR}
    fillColor={FILL_COLOR}
  >
    <TrialGlyph />
  </CrystalBalloonIndicator>
);

export default CrystalTrialGeneratingIndicator;
