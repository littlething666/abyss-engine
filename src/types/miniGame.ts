export type MiniGamePhase = 'playing' | 'submitted' | 'reviewed';

export interface MiniGamePlacement {
  itemId: string;
  targetId: string;
  isItemCorrect: boolean;
}

export interface MiniGameResult {
  totalItems: number;
  correctItems: number;
  score: number;
  isCorrect: boolean;
  placements: MiniGamePlacement[];
}
