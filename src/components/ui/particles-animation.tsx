import type { CSSProperties } from 'react';

const PARTICLE_ANIMATION_STYLE = `
@keyframes abyss-ritual-particle {
  0% {
    opacity: 0;
    transform: translate3d(0, 0, 0) scale(0);
  }
  15% {
    opacity: 0.9;
    transform: translate3d(var(--tx-mid), var(--ty-mid), 0) scale(1);
  }
  65% {
    opacity: 0.2;
    transform: translate3d(var(--tx), var(--ty), 0) scale(0.45);
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--tx), var(--ty), 0) scale(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .abyss-ritual-particle {
    animation: none !important;
  }
}
`;

type ParticleCustomCSSProperties = CSSProperties & {
  ['--tx']: string;
  ['--ty']: string;
  ['--tx-mid']: string;
  ['--ty-mid']: string;
};

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
      <style>{PARTICLE_ANIMATION_STYLE}</style>
      {particles.map((particle) => (
        <span
          key={`${particle.x}-${particle.y}-${particle.delay}`}
          className={`absolute rounded-full pointer-events-none abyss-ritual-particle ${particleClassName}`}
          style={{
            width: `${particleSize}px`,
            height: `${particleSize}px`,
            boxShadow: particleGlow,
            left: '50%',
            top: '50%',
            transform: 'translate3d(0, 0, 0) scale(0)',
            animation: `abyss-ritual-particle ${particle.duration}s ease-out infinite`,
            animationDelay: `${particle.delay}s`,
            ['--tx']: `${particle.x}px`,
            ['--ty']: `${particle.y}px`,
            ['--tx-mid']: `${Math.round(particle.x * 0.4)}px`,
            ['--ty-mid']: `${Math.round(particle.y * 0.4)}px`,
            ...particleStyle,
          } as ParticleCustomCSSProperties}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
