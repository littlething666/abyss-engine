import { describe, it, expect } from 'vitest';
import {
  createMistShudder,
  createEmberSparks,
  createArcaneSparkles,
  createRuneCircle,
  createEffectForTier,
} from '../effects';
import type { EffectConfig } from '../types';
import { hasAliveParticles } from '../particleEngine';

const BASE_CONFIG: EffectConfig = {
  tier: 1,
  cardRect: { x: 50, y: 50, width: 300, height: 200 },
  canvasWidth: 400,
  canvasHeight: 600,
};

describe('effects', () => {
  describe('createMistShudder', () => {
    it('spawns particles on first update', () => {
      const effect = createMistShudder({ ...BASE_CONFIG, tier: 1 });
      expect(hasAliveParticles(effect.particles)).toBe(false);
      effect.update(0.016, effect);
      expect(hasAliveParticles(effect.particles)).toBe(true);
    });

    it('has correct duration', () => {
      const effect = createMistShudder({ ...BASE_CONFIG, tier: 1 });
      expect(effect.duration).toBe(0.8);
    });
  });

  describe('createEmberSparks', () => {
    it('spawns particles on first update', () => {
      const effect = createEmberSparks({ ...BASE_CONFIG, tier: 2 });
      effect.update(0.016, effect);
      expect(hasAliveParticles(effect.particles)).toBe(true);
    });
  });

  describe('createArcaneSparkles', () => {
    it('has a custom draw function', () => {
      const effect = createArcaneSparkles({ ...BASE_CONFIG, tier: 3 });
      expect(effect.draw).toBeDefined();
    });

    it('has postDraw for radial glow', () => {
      const effect = createArcaneSparkles({ ...BASE_CONFIG, tier: 3 });
      expect(effect.postDraw).toBeDefined();
    });
  });

  describe('createRuneCircle', () => {
    it('has the longest duration at 2.0s', () => {
      const effect = createRuneCircle({ ...BASE_CONFIG, tier: 4 });
      expect(effect.duration).toBe(2.0);
    });

    it('spawns burst particles after BURST_TIME', () => {
      const effect = createRuneCircle({ ...BASE_CONFIG, tier: 4 });
      // Before burst time
      effect.elapsed = 0;
      effect.update(0.016, effect);
      expect(hasAliveParticles(effect.particles)).toBe(false);
      // After burst time
      effect.elapsed = 0.8;
      effect.update(0.016, effect);
      expect(hasAliveParticles(effect.particles)).toBe(true);
    });
  });

  describe('createEffectForTier', () => {
    it('maps tier 1 to MistShudder', () => {
      const effect = createEffectForTier({ ...BASE_CONFIG, tier: 1 });
      expect(effect.duration).toBe(0.8);
    });

    it('maps tier 2 to EmberSparks', () => {
      const effect = createEffectForTier({ ...BASE_CONFIG, tier: 2 });
      expect(effect.duration).toBe(1.0);
    });

    it('maps tier 3 to ArcaneSparkles', () => {
      const effect = createEffectForTier({ ...BASE_CONFIG, tier: 3 });
      expect(effect.duration).toBe(1.2);
    });

    it('maps tier 4 to RuneCircle', () => {
      const effect = createEffectForTier({ ...BASE_CONFIG, tier: 4 });
      expect(effect.duration).toBe(2.0);
    });
  });
});
