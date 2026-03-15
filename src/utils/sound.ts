/**
 * Sound utility for playing audio feedback using Web Audio API
 * Only plays sounds for positive feedback (rating >= 3)
 */

let audioContext: AudioContext | null = null;

/**
 * Get or create AudioContext singleton
 * Creates on first call, reuses existing context
 */
function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/**
 * Play a pleasant chime sound for positive feedback
 * Uses Web Audio API to generate a soft, ascending tone
 */
export function playPositiveSound(): void {
  try {
    const ctx = getAudioContext();

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const currentTime = ctx.currentTime;

    // Create oscillator for the main tone
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    // Configure oscillator - pleasant sine wave
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, currentTime); // C5 note
    oscillator.frequency.setValueAtTime(659.25, currentTime + 0.1); // E5 note
    oscillator.frequency.setValueAtTime(783.99, currentTime + 0.2); // G5 note

    // Configure gain for soft fade-in and fade-out
    gainNode.gain.setValueAtTime(0, currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, currentTime + 0.4);

    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Play
    oscillator.start(currentTime);
    oscillator.stop(currentTime + 0.4);

    // Add a second harmonic for richer sound
    const oscillator2 = ctx.createOscillator();
    const gainNode2 = ctx.createGain();

    oscillator2.type = 'sine';
    oscillator2.frequency.setValueAtTime(1046.5, currentTime + 0.1); // C6 note (octave up)

    gainNode2.gain.setValueAtTime(0, currentTime + 0.1);
    gainNode2.gain.linearRampToValueAtTime(0.15, currentTime + 0.15);
    gainNode2.gain.linearRampToValueAtTime(0, currentTime + 0.35);

    oscillator2.connect(gainNode2);
    gainNode2.connect(ctx.destination);

    oscillator2.start(currentTime + 0.1);
    oscillator2.stop(currentTime + 0.35);
  } catch (error) {
    // Silently fail if audio is not supported
    console.warn('Audio playback failed:', error);
  }
}

/**
 * Play a sharper level-up sound for growth milestones
 * Uses a bright two-note fanfare for quick recognition
 */
export function playLevelUpSound(): void {
  try {
    const ctx = getAudioContext();

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const currentTime = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(587.33, currentTime); // D5
    oscillator.frequency.setValueAtTime(783.99, currentTime + 0.07); // G5
    oscillator.frequency.setValueAtTime(1174.66, currentTime + 0.14); // D6

    gainNode.gain.setValueAtTime(0, currentTime);
    gainNode.gain.linearRampToValueAtTime(0.35, currentTime + 0.04);
    gainNode.gain.linearRampToValueAtTime(0, currentTime + 0.28);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(currentTime);
    oscillator.stop(currentTime + 0.28);
  } catch (error) {
    console.warn('Audio playback failed:', error);
  }
}

export function playTimerFinishedSound(): void {
  try {
    const ctx = getAudioContext();

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const currentTime = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(523.25, currentTime);
    oscillator.frequency.setValueAtTime(783.99, currentTime + 0.12);
    oscillator.frequency.setValueAtTime(987.77, currentTime + 0.24);

    gainNode.gain.setValueAtTime(0, currentTime);
    gainNode.gain.linearRampToValueAtTime(0.25, currentTime + 0.03);
    gainNode.gain.linearRampToValueAtTime(0, currentTime + 0.45);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(currentTime);
    oscillator.stop(currentTime + 0.45);
  } catch (error) {
    console.warn('Audio playback failed:', error);
  }
}
