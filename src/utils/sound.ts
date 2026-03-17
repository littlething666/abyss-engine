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
 * Uses a bright retro power-up climb, inspired by classic Mario growth cues
 */
export function playLevelUpSound(): void {
  try {
    const ctx = getAudioContext();

    // Resume context if suspended (browser autoplay policy)
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
    gainNode.gain.linearRampToValueAtTime(0.22, currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0.12, currentTime + 0.2);
    gainNode.gain.linearRampToValueAtTime(0.04, currentTime + 0.4);
    gainNode.gain.linearRampToValueAtTime(0, currentTime + duration);

    const tones = [
      { frequency: 587.33, time: 0 }, // D5
      { frequency: 698.46, time: 0.06 }, // F5
      { frequency: 783.99, time: 0.12 }, // G5
      { frequency: 1046.5, time: 0.18 }, // C6
      { frequency: 1318.51, time: 0.24 }, // E6
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
    sparkleGain.gain.setValueAtTime(0.06, currentTime);
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

/**
 * Play a rapid Mario-style sprout power-up chirp.
 */
export interface SproutOptions {
  /** The shape of the wave: 'square', 'sawtooth', 'triangle', or 'sine' */
  type?: OscillatorType
  /** The starting frequency in Hz */
  baseFreqStart?: number
  /** The ratio between the alternating notes (1.5 = perfect fifth) */
  freqMultiplier?: number
  /** How many Hz the base pitch shifts upward per frame */
  freqStep?: number
  /** Duration of each note in seconds */
  speed?: number
  /** Total number of notes to play before stopping */
  totalNotes?: number
}

export function playSproutSound(options: SproutOptions = {}): void {
  // Set default values that recreate the classic Mario square wave sprout
  const {
    type = 'square',
    baseFreqStart = 200,
    freqMultiplier = 1.5,
    freqStep = 3,
    speed = 0.036,
    totalNotes = 30
  } = options

  try {
    // Assuming getAudioContext is defined elsewhere in your app
    const ctx = getAudioContext()

    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    const currentTime = ctx.currentTime
    const stopTime = currentTime + (totalNotes * speed)

    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()

    // Dynamically set the waveform based on our parameters
    osc.type = type

    let baseFreq = baseFreqStart

    for (let i = 0; i < totalNotes; i += 1) {
      const time = currentTime + i * speed

      // Alternate between the base frequency and the multiplied interval
      const freq = i % 2 === 0 ? baseFreq : baseFreq * freqMultiplier
      osc.frequency.setValueAtTime(freq, time)

      // Shift the pitch up for the next loop
      baseFreq += freqStep
    }

    // Volume envelope
    gainNode.gain.setValueAtTime(0.08, currentTime)
    gainNode.gain.setValueAtTime(0.08, stopTime - 0.05)
    gainNode.gain.linearRampToValueAtTime(0, stopTime)

    osc.connect(gainNode)
    gainNode.connect(ctx.destination)

    osc.start(currentTime)
    osc.stop(stopTime)
  } catch (error) {
    console.warn('Audio playback failed:', error)
  }
}

/**
 * Play a retro victory fanfare motif.
 */

const fanfareMelody: Array<[number, number, number]> = [
  [523.25, 0.00, 0.10],
  [523.25, 0.15, 0.10],
  [523.25, 0.30, 0.10],
  [523.25, 0.45, 0.35],
  [415.3, 0.85, 0.35],
  [466.16, 1.25, 0.35],
  [523.25, 1.65, 0.28],
  [466.16, 2.05, 0.13],
  [523.25, 2.25, 0.68],
];

export function playVictoryFanfare(): void {
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
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const startTime = ctx.currentTime;
    const melody = fanfareMelody.slice(-3);

    melody.forEach(([frequency, delay, duration]) => {
      delay -= 1.5;
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
