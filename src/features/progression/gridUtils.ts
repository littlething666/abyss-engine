/**
 * Grid Algorithms Layer - gridUtils.ts
 *
 * Responsibilities:
 * - Find adjacent empty positions for crystal placement
 * - Calculate next available grid position using spiral outward algorithm
 * - Grid position management for the crystal placement system
 *
 * Grid Coordinate System:
 * - [0, 0] = Wisdom Altar position (always reserved)
 * - Grid expands outward in a spiral pattern
 * - Positions are [x, z] pairs
 */

import { ActiveCrystal } from '../../types';

/**
 * Altar's fixed grid position
 */
export const ALTAR_POSITION: [number, number] = [0, 0];

/**
 * Maximum radius for grid search (prevents infinite loops)
 */
const MAX_GRID_RADIUS = 20;

/**
 * Find an adjacent empty position next to a reference position
 * Searches in order: [x+1, z], [x-1, z], [x, z+1], [x, z-1]
 *
 * @param referencePosition - The [x, z] position to search adjacent to
 * @param existingCrystals - Currently occupied positions
 * @returns First available adjacent [x, z] position or null if none found
 */
export function findAdjacentPosition(
  referencePosition: [number, number],
  existingCrystals: ActiveCrystal[]
): [number, number] | null {
  const occupied = new Set(existingCrystals.map(c => `${c.gridPosition[0]},${c.gridPosition[1]}`));
  // Always exclude altar position
  occupied.add('0,0');

  const [refX, refZ] = referencePosition;

  // Search order: right, left, down, up
  const searchOrder: [number, number][] = [
    [refX + 1, refZ],
    [refX - 1, refZ],
    [refX, refZ + 1],
    [refX, refZ - 1],
  ];

  for (const pos of searchOrder) {
    const key = `${pos[0]},${pos[1]}`;
    if (!occupied.has(key)) {
      return pos;
    }
  }

  return null;
}

/**
 * Find the next available grid position using spiral outward algorithm
 * Starts from [0,0] (Wisdom Altar position) and spirals outward
 * Excludes [0,0] since that's where the altar is
 *
 * @param existingCrystals - Currently occupied positions (active crystals)
 * @returns Next available [x, z] position or null if grid is full
 */
export function findNextGridPosition(existingCrystals: ActiveCrystal[]): [number, number] | null {
  const occupied = new Set(existingCrystals.map(c => `${c.gridPosition[0]},${c.gridPosition[1]}`));

  // Always exclude [0,0] - that's where the Wisdom Altar is
  occupied.add('0,0');

  // Spiral outward algorithm from origin
  // Sequence: [1,0], [-1,0], [0,1], [0,-1], [1,1], [-1,1], [1,-1], [-1,-1], [2,0], [-2,0], etc.
  for (let radius = 1; radius <= MAX_GRID_RADIUS; radius++) {
    // For each radius, check positions in a square pattern
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        // Only check positions at exactly this radius (the outer edge of the square)
        if (Math.abs(x) === radius || Math.abs(z) === radius) {
          const key = `${x},${z}`;
          if (!occupied.has(key)) {
            return [x, z];
          }
        }
      }
    }
  }

  return null; // Grid is full
}

/**
 * Calculate a spawn position for a crystal based on topic prerequisites
 * - If topic has prerequisites: spawn adjacent to the prerequisite's crystal
 * - If no prerequisites (Tier 1): spawn adjacent to the Altar [0,0]
 *
 * @param topicId - The topic to spawn a crystal for
 * @param prerequisites - Array of prerequisite topic IDs
 * @param activeCrystals - Currently active crystals
 * @returns Position where crystal should be spawned, or null if no space
 */
export function calculateSpawnPosition(
  prerequisites: { topicId: string; requiredLevel: number }[],
  activeCrystals: ActiveCrystal[]
): [number, number] | null {
  let position: [number, number] | null = null;

  if (prerequisites && prerequisites.length > 0) {
    // Find the first prerequisite's crystal position
    for (const prereq of prerequisites) {
      const prereqCrystal = activeCrystals.find(c => c.topicId === prereq.topicId);
      if (prereqCrystal) {
        // Try to find adjacent position to the prerequisite crystal
        position = findAdjacentPosition(prereqCrystal.gridPosition, activeCrystals);
        if (position) break;
      }
    }

    // If no adjacent position found from prerequisites, fall back to spiral algorithm
    if (!position) {
      position = findNextGridPosition(activeCrystals);
    }
  } else {
    // Tier 1 topic - spawn adjacent to Altar [0,0]
    position = findAdjacentPosition(ALTAR_POSITION, activeCrystals);

    // If no adjacent position to altar, fall back to spiral algorithm
    if (!position) {
      position = findNextGridPosition(activeCrystals);
    }
  }

  return position;
}

