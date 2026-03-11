import { motion } from 'motion/react';
import type { CSSProperties } from 'react';

export interface ParticleAnimationPoint {
  x: number;
  y: number;
  delay: number;
  duration: number;
}

export const RITUAL_PARTICLE_ANIMATION: readonly ParticleAnimationPoint[] = [
  { x: -12, y: -12, delay: 0, duration: 1.4 },
  { x: 0, y: -16, delay: 0.2, duration: 1.6 },
  { x: 12, y: -12, delay: 0.4, duration: 1.8 },
  { x: -14, y: 0, delay: 0.6, duration: 1.5 },
  { x: 14, y: 0, delay: 0.8, duration: 1.9 },
  { x: -12, y: 12, delay: 1.0, duration: 1.7 },
  { x: 0, y: 16, delay: 1.1, duration: 1.6 },
  { x: 12, y: 12, delay: 1.3, duration: 1.8 },
] as const;

export interface ParticlesAnimationProps {
  isActive: boolean;
  particles?: readonly ParticleAnimationPoint[];
  particleClassName?: string;
  particleStyle?: CSSProperties;
  particleSize?: number;
  particleGlow?: string;
}

export function ParticlesAnimation({
  isActive,
  particles = RITUAL_PARTICLE_ANIMATION,
  particleClassName = 'bg-violet-200/90',
  particleSize = 6,
  particleGlow = '0 0 8px 2px rgba(196, 181, 253, 0.7)',
  particleStyle = {},
}: ParticlesAnimationProps) {
  if (!isActive) {
    return null;
  }

  return (
    <>
      {particles.map((particle) => (
        <motion.span
          key={`${particle.x}-${particle.y}-${particle.delay}`}
          className={`absolute rounded-full pointer-events-none ${particleClassName}`}
          style={{
            width: `${particleSize}px`,
            height: `${particleSize}px`,
            boxShadow: particleGlow,
            ...particleStyle,
          }}
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
          animate={{
            opacity: [0, 0.85, 0],
            scale: [0, 1.1, 0],
            x: [0, particle.x, 0],
            y: [0, particle.y, 0],
          }}
          transition={{
            duration: particle.duration,
            repeat: Number.POSITIVE_INFINITY,
            delay: particle.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </>
  );
}
