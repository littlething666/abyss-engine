export type GeometryType = 'box' | 'cylinder' | 'sphere' | 'octahedron' | 'plane';

export type CrystalBaseShape = 'icosahedron' | 'octahedron' | 'tetrahedron' | 'dodecahedron';

export const CRYSTAL_BASE_SHAPES: readonly CrystalBaseShape[] = [
  'icosahedron',
  'octahedron',
  'tetrahedron',
  'dodecahedron',
] as const;

export const DEFAULT_CRYSTAL_BASE_SHAPE: CrystalBaseShape = 'icosahedron';

export interface SubjectGeometry {
  gridTile: GeometryType;
}

export interface Subject {
  id: string;
  name: string;
  description: string;
  color: string;
  geometry: SubjectGeometry;
  crystalBaseShape?: CrystalBaseShape;
  topicIds?: string[];
}

/** Curriculum edge: parent `topicId` must reach at least `minLevel` (crystal) before the dependent unlocks. */
export type GraphPrerequisiteEntry = string | { topicId: string; minLevel: number };

export interface GraphNode {
  topicId: string;
  title: string;
  tier: number;
  prerequisites: GraphPrerequisiteEntry[];
  learningObjective: string;
}

export interface SubjectGraph {
  subjectId: string;
  title: string;
  themeId: string;
  maxTier: number;
  nodes: GraphNode[];
}

export interface TopicDetails {
  topicId: string;
  title: string;
  subjectId: string;
  coreConcept: string;
  theory: string;
  keyTakeaways: string[];
}

export type CardType = 'FLASHCARD' | 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'MINI_GAME';

export type MiniGameType = 'CATEGORY_SORT' | 'SEQUENCE_BUILD' | 'CONNECTION_WEB';

export interface FlashcardContent {
  front: string;
  back: string;
}

export interface SingleChoiceContent {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface MultiChoiceContent {
  question: string;
  options: string[];
  correctAnswers: string[];
  explanation: string;
}

export interface CategorySortContent {
  gameType: 'CATEGORY_SORT';
  prompt: string;
  categories: { id: string; label: string }[];
  items: { id: string; label: string; categoryId: string }[];
  explanation: string;
}

export interface SequenceBuildContent {
  gameType: 'SEQUENCE_BUILD';
  prompt: string;
  items: { id: string; label: string; correctPosition: number }[];
  explanation: string;
}

export interface ConnectionWebContent {
  gameType: 'CONNECTION_WEB';
  prompt: string;
  pairs: { id: string; left: string; right: string }[];
  distractors?: { side: 'left' | 'right'; label: string }[];
  explanation: string;
}

export type MiniGameContent = CategorySortContent | SequenceBuildContent | ConnectionWebContent;

export interface Card {
  id: string;
  type: CardType;
  difficulty: number;
  content: FlashcardContent | SingleChoiceContent | MultiChoiceContent | MiniGameContent;
}

export interface TopicCardGroup {
  topicId: string;
  cards: Card[];
}

export interface ActiveCrystal {
  topicId: string;
  gridPosition: [number, number];
  xp: number;
  spawnedAt: number;
}
