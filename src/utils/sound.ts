/**
 * Sound utility for playing audio feedback using Web Audio API.
 *
 * Every exported `play*` function is globally gated by
 * `getSfxEnabled()` from the feature-flags store. When the flag is OFF (the default), each
 * call is a silent no-op — no AudioContext is created, no oscillators
 * scheduled. This is the single authoritative SFX gate; do not short-circuit
 * it in individual call sites.
 */

import { getSfxEnabled } from '../store/featureFlagsStore';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/**
 * Play a pleasant chime sound for positive feedback.
 * Uses Web Audio API to generate a soft, ascending tone.
 */
export function playPositiveSound(): void {
  if (!getSfxEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const currentTime = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, currentTime);
    oscillator.frequency.setValueAtTime(659.25, currentTime + 0.1);
    oscillator.frequency.setValueAtTime(783.99, currentTime + 0.2);
    gainNode.gain.setValueAtTime(0, currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, currentTime + 0.4);
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(currentTime);
    oscillator.stop(currentTime + 0.4);

    const oscillator2 = ctx.createOscillator();
    const gainNode2 = ctx.createGain();
    oscillator2.type = 'sine';
    oscillator2.frequency.setValueAtTime(1046.5, currentTime + 0.1);
    gainNode2.gain.setValueAtTime(0, currentTime + 0.1);
    gainNode2.gain.linearRampToValueAtTime(0.15, currentTime + 0.15);
    gainNode2.gain.linearRampToValueAtTime(0, currentTime + 0.35);
    oscillator2.connect(gainNode2);
    gainNode2.connect(ctx.destination);
    oscillator2.start(currentTime + 0.1);
    oscillator2.stop(currentTime + 0.35);
  } catch (error) {
    console.warn('Audio playback failed:', error);
  }
}

// Mario-style coin pickup sound
export function playCoinPickupSound(): void {
  if (!getSfxEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const currentTime = ctx.currentTime;
    const duration = 0.55;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, currentTime);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, currentTime);
    gainNode.gain.linearRampToValueAtTime(0.09, currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0.05, currentTime + 0.2);
    gainNode.gain.linearRampToValueAtTime(0.017, currentTime + 0.4);
    gainNode.gain.linearRampToValueAtTime(0, currentTime + duration);

    const tones = [
      { frequency: 587.33, time: 0 },
      { frequency: 698.46, time: 0.06 },
      { frequency: 783.99, time: 0.12 },
      { frequency: 1046.5, time: 0.18 },
      { frequency: 1318.51, time: 0.24 },
    ];

    const oscillator = ctx.createOscillator();
    oscillator.type = 'square';
    tones.forEach((tone) => {
      oscillator.frequency.setValueAtTime(tone.frequency, currentTime + tone.time);
    });

    const sparkle = ctx.createOscillator();
    const sparkleGain = ctx.createGain();
    sparkle.type = 'triangle';
    sparkle.detune.value = -140;
    sparkle.frequency.setValueAtTime(880, currentTime);
    sparkle.frequency.exponentialRampToValueAtTime(1760, currentTime + 0.22);
    sparkleGain.gain.setValueAtTime(0.025, currentTime);
    sparkleGain.gain.linearRampToValueAtTime(0, currentTime + 0.35);

    oscillator.connect(filter);
    sparkle.connect(sparkleGain);
    sparkleGain.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(currentTime);
    sparkle.start(currentTime + 0.05);
    sparkle.stop(currentTime + 0.35);
    oscillator.stop(currentTime + duration);
  } catch (error) {
    console.warn('Audio playback failed:', error);
  }
}

export interface SproutOptions {
  type?: OscillatorType;
  baseFreqStart?: number;
  freqMultiplier?: number;
  freqStep?: number;
  speed?: number;
  totalNotes?: number;
  volume?: number;
}

export function playSproutSound(options: SproutOptions = {}): void {
  if (!getSfxEnabled()) return;
  const {
    type = 'square',
    baseFreqStart = 200,
    freqMultiplier = 1.5,
    freqStep = 3,
    speed = 0.036,
    totalNotes = 30,
    volume = 0.07,
  } = options;

  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const currentTime = ctx.currentTime;
    const stopTime = currentTime + totalNotes * speed;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = type;

    let baseFreq = baseFreqStart;
    for (let i = 0; i < totalNotes; i += 1) {
      const time = currentTime + i * speed;
      const freq = i % 2 === 0 ? baseFreq : baseFreq * freqMultiplier;
      osc.frequency.setValueAtTime(freq, time);
      baseFreq += freqStep;
    }

    gainNode.gain.setValueAtTime(volume, currentTime);
    gainNode.gain.setValueAtTime(volume, stopTime - 0.05);
    gainNode.gain.linearRampToValueAtTime(0, stopTime);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(currentTime);
    osc.stop(stopTime);
  } catch (error) {
    console.warn('Audio playback failed:', error);
  }
}

const LEVEL_UP_OPTIONS: SproutOptions = {
  freqMultiplier: 1.25,
  baseFreqStart: 150,
  freqStep: 3.5,
  totalNotes: 30,
  speed: 0.033,
  volume: 0.04,
};

export const playLevelUpSound = (): void => {
  // Gate is enforced inside playSproutSound; no double check needed.
  playSproutSound(LEVEL_UP_OPTIONS);
};

const fanfareMelody: Array<[number, number, number]> = [
  [523.25, 0.0, 0.1],
  [523.25, 0.15, 0.1],
  [523.25, 0.3, 0.1],
  [523.25, 0.45, 0.35],
  [415.3, 0.85, 0.35],
  [466.16, 1.25, 0.35],
  [523.25, 1.65, 0.28],
  [466.16, 2.05, 0.13],
  [523.25, 2.25, 0.68],
];

export function playVictoryFanfare(): void {
  if (!getSfxEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const startTime = ctx.currentTime;
    const melody = fanfareMelody;

    melody.forEach(([frequency, delay, duration]) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = frequency;

      const t = startTime + delay;
      gainNode.gain.setValueAtTime(0, t);
      gainNode.gain.linearRampToValueAtTime(0.15, t + 0.02);
      gainNode.gain.setValueAtTime(0.15, t + duration - 0.05);
      gainNode.gain.linearRampToValueAtTime(0, t + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + duration);
    });
  } catch (error) {
    console.warn('Audio playback failed:', error);
  }
}

export function playTuturuSound(): void {
  if (!getSfxEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const startTime = ctx.currentTime;
    const melody = fanfareMelody.slice(-3);

    melody.forEach(([frequency, delayValue, duration]) => {
      const delay = delayValue - 1.5;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = frequency;

      const t = startTime + delay;
      gainNode.gain.setValueAtTime(0, t);
      gainNode.gain.linearRampToValueAtTime(0.15, t + 0.02);
      gainNode.gain.setValueAtTime(0.15, t + duration - 0.05);
      gainNode.gain.linearRampToValueAtTime(0, t + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + duration);
    });
  } catch (error) {
    console.warn('Audio playback failed:', error);
  }
}

export function playTimerFinishedSound(): void {
  if (!getSfxEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const currentTime = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, currentTime);
    oscillator.frequency.setValueAtTime(783.99, currentTime + 0.12);
    oscillator.frequency.setValueAtTime(987.77, currentTime + 0.24);

    gainNode.gain.setValueAtTime(0, currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, currentTime + 0.04);
    gainNode.gain.linearRampToValueAtTime(0, currentTime + 0.45);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(currentTime);
    oscillator.stop(currentTime + 0.45);
  } catch (error) {
    console.warn('Audio playback failed:', error);
  }
}
