import { describe, it, expect } from 'vitest';
import {
  createParticlePool,
  createDeadParticle,
  spawnParticle,
  updateParticles,
  killAllParticles,
  hasAliveParticles,
} from '../particleEngine';

describe('particleEngine', () => {
  describe('createParticlePool', () => {
    it('creates a pool of 200 dead particles', () => {
      const pool = createParticlePool();
      expect(pool).toHaveLength(200);
      expect(pool.every((p) => !p.alive)).toBe(true);
    });
  });

  describe('createDeadParticle', () => {
    it('returns a particle with alive=false', () => {
      const p = createDeadParticle();
      expect(p.alive).toBe(false);
      expect(p.life).toBe(0);
    });
  });

  describe('spawnParticle', () => {
    it('activates a dead slot with overrides', () => {
      const pool = createParticlePool();
      const p = spawnParticle(pool, { x: 10, y: 20, life: 1, maxLife: 1 });
      expect(p).not.toBeNull();
      expect(p!.alive).toBe(true);
      expect(p!.x).toBe(10);
      expect(p!.y).toBe(20);
      expect(p!.life).toBe(1);
    });

    it('returns null when pool is full', () => {
      const pool = createParticlePool();
      for (const p of pool) {
        p.alive = true;
      }
      const result = spawnParticle(pool, { x: 0, y: 0 });
      expect(result).toBeNull();
    });
  });

  describe('updateParticles', () => {
    it('moves alive particles and decrements life', () => {
      const pool = createParticlePool();
      spawnParticle(pool, { x: 0, y: 0, vx: 100, vy: 50, life: 1, maxLife: 1 });
      updateParticles(pool, 0.1);
      const p = pool[0];
      expect(p.x).toBeCloseTo(10, 1);
      expect(p.y).toBeCloseTo(5, 1);
      expect(p.life).toBeCloseTo(0.9, 1);
    });

    it('kills particles when life reaches zero', () => {
      const pool = createParticlePool();
      spawnParticle(pool, { x: 0, y: 0, life: 0.05, maxLife: 1 });
      updateParticles(pool, 0.1);
      expect(pool[0].alive).toBe(false);
    });
  });

  describe('killAllParticles', () => {
    it('marks all particles as dead', () => {
      const pool = createParticlePool();
      spawnParticle(pool, { life: 1, maxLife: 1 });
      spawnParticle(pool, { life: 1, maxLife: 1 });
      expect(hasAliveParticles(pool)).toBe(true);
      killAllParticles(pool);
      expect(hasAliveParticles(pool)).toBe(false);
    });
  });
});
