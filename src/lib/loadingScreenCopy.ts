/**
 * Static copy for the cloud loading overlay (presentation only).
 */

export const LOADING_STATUS_PHRASES = [
  'Gathering Knowledge…',
  'Preparing Your Journey…',
  'Almost There…',
  'One More Step…',
  'Preparing…',
  'Awakening…',
  'Loading Wisdom…',
  'Brewing Knowledge…',
] as const;

export const LOADING_QUOTES = [
  'Every master was once a beginner with a map and a dream.',
  'Small steps forge legendary paths.',
  'Knowledge grows where patience is planted.',
  'Even the wisest mage learned one rune at a time.',
  'Progress is slow magic—trust the spell.',
  'Every mistake is a clue, not a curse.',
  'Your journey levels up with every try.',
  'Hard paths lead to powerful skills.',
  'Struggle is the forge of understanding.',
  "When it feels tough, you're gaining strength.",
  'The puzzle resists—but so do you.',
  'Great quests are never easy.',
  'Confusion is the first step toward clarity.',
  'A little learning each day builds great power.',
  'Tiny gains today, epic wins tomorrow.',
  'Keep going—the story unfolds step by step.',
  'Time and effort turn sparks into mastery.',
  'Daily practice writes your legend.',
  'Stay curious—the world reveals its secrets slowly.',
  'Every question opens a hidden door.',
  'Learning is the truest form of adventure.',
  'Dare to try, dare to grow.',
  'Your mind is your greatest artifact.',
  'Collect knowledge like treasures—one gem at a time.',
  'Each lesson unlocks a new realm.',
  'Wisdom is the rarest loot.',
  'Sharpen your mind as you would your blade.',
  'The quest for knowledge never ends—only evolves.',
] as const;

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic index in `[0, length)` for hydration-safe first picks. */
export function pickSeededIndex(length: number, seed: number): number {
  if (length <= 0) {
    return 0;
  }
  const next = mulberry32(seed >>> 0);
  return Math.floor(next() * length);
}
