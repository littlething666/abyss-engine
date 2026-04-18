export const CRYSTAL_NOTIFICATION_GLYPH_GENERATING = '⏳';
export const CRYSTAL_NOTIFICATION_GLYPH_TRIAL_PREGENERATION = '⚙️';
export const CRYSTAL_NOTIFICATION_GLYPH_CELEBRATION = '🎉';

export type CrystalNotificationKind =
  | 'generating'
  | 'trial_pregeneration'
  | 'celebration';

export type CrystalNotificationRotationMode = 'none' | 'hourglass' | 'trial_gear';

export interface ResolvedCrystalNotification {
  kind: CrystalNotificationKind;
  glyph: string;
  rotationMode: CrystalNotificationRotationMode;
}

export interface ResolveCrystalNotificationFlagsInput {
  isContentGenerating: boolean;
  isTrialPregenerating: boolean;
  isCelebrationPending: boolean;
}

/**
 * Picks at most one notification per crystal: generating → trial pregeneration → celebration.
 */
export function resolveCrystalNotificationFlags(
  input: ResolveCrystalNotificationFlagsInput,
): ResolvedCrystalNotification | null {
  if (input.isContentGenerating) {
    return {
      kind: 'generating',
      glyph: CRYSTAL_NOTIFICATION_GLYPH_GENERATING,
      rotationMode: 'hourglass',
    };
  }

  if (input.isTrialPregenerating) {
    return {
      kind: 'trial_pregeneration',
      glyph: CRYSTAL_NOTIFICATION_GLYPH_TRIAL_PREGENERATION,
      rotationMode: 'trial_gear',
    };
  }

  if (input.isCelebrationPending) {
    return {
      kind: 'celebration',
      glyph: CRYSTAL_NOTIFICATION_GLYPH_CELEBRATION,
      rotationMode: 'none',
    };
  }

  return null;
}
