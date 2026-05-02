import type { GenerationStrategy } from './generationStrategy';
import type { GroundingSource } from './grounding';
import type { StudyChecklist } from './studyChecklist';

export type GeometryType = 'box' | 'cylinder' | 'sphere' | 'octahedron' | 'plane';

export type CrystalBaseShape = 'icosahedron' | 'octahedron' | 'tetrahedron' | 'dodecahedron';

export const CRYSTAL_BASE_SHAPES: readonly CrystalBaseShape[] = [
  'icosahedron',
  'octahedron',
  'tetrahedron',
  'dodecahedron',
] as const;

/**
 * Curated Lucide icon name attached to every curriculum topic. Mirrors the
 * runtime allowlist `TOPIC_ICON_NAMES` declared in
 * `src/features/subjectGeneration/graph/topicIcons/topicIconAllowlist.ts`.
 *
 * Mirroring (rather than re-exporting from `features/`) keeps `src/types`
 * framework-free and avoids `features/` imports. A bidirectional coverage test
 * (`topicIconAllowlist.test.ts`) asserts the runtime list and this union remain
 * in sync; failing CI signals a missing edit.
 */
export type TopicIconName =
  | 'atom'
  | 'beaker'
  | 'binary'
  | 'book-open'
  | 'brain'
  | 'calculator'
  | 'chart-line'
  | 'cloud'
  | 'code-xml'
  | 'compass'
  | 'cpu'
  | 'database'
  | 'dna'
  | 'flask-conical'
  | 'function-square'
  | 'globe'
  | 'graduation-cap'
  | 'hammer'
  | 'handshake'
  | 'heart-pulse'
  | 'landmark'
  | 'languages'
  | 'leaf'
  | 'lightbulb'
  | 'map'
  | 'microscope'
  | 'music'
  | 'network'
  | 'palette'
  | 'pen-tool'
  | 'puzzle'
  | 'rocket'
  | 'ruler'
  | 'scale'
  | 'server'
  | 'shield'
  | 'sigma'
  | 'telescope'
  | 'users'
  | 'wrench';

/**
 * Curated icon name attached to the floating mentor bubble. Mirrors the
 * runtime allowlist `MENTOR_ICON_NAMES` declared in
 * `src/features/mentor/mentorIconAllowlist.ts`.
 *
 * Disjoint from `TopicIconName` by design — mentor and topic icon vocabularies
 * are independent feature surfaces. `MENTOR_ICON_NAMES` includes one custom
 * `philosopher-stone` glyph hand-authored inside the build-time generator;
 * the other 8 entries flow from `lucide`. A bidirectional coverage test
 * (`mentorIconAllowlist.test.ts`) keeps the runtime list and this union in sync.
 */
export type MentorIconName =
  | 'smile'
  | 'laugh'
  | 'frown'
  | 'party-popper'
  | 'lightbulb'
  | 'compass'
  | 'network'
  | 'triangle-alert'
  | 'philosopher-stone';

export interface SubjectGeometry {
  gridTile: GeometryType;
}

export interface SubjectMetadata {
  checklist: StudyChecklist;
  strategy: GenerationStrategy;
}

export interface Subject {
  id: string;
  name: string;
  description: string;
  color: string;
  geometry: SubjectGeometry;
  topicIds?: string[];
  metadata?: SubjectMetadata;
}

/** Curriculum edge: parent `topicId` must reach at least `minLevel` (crystal) before the dependent unlocks. */
export type GraphPrerequisiteEntry = string | { topicId: string; minLevel: number };

export interface GraphNode {
  topicId: string;
  title: string;
  iconName: TopicIconName;
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

/** Syllabus buckets for difficulties 1-4; used for lookahead card generation. */
export type CoreQuestionsByDifficulty = {
  1: string[];
  2: string[];
  3: string[];
  4: string[];
};

export interface TopicDetails {
  topicId: string;
  title: string;
  subjectId: string;
  coreConcept: string;
  theory: string;
  keyTakeaways: string[];
  /** Populated after on-demand generation; drives background difficulty expansion. */
  coreQuestionsByDifficulty?: Partial<CoreQuestionsByDifficulty>;
  groundingSources?: GroundingSource[];
}

export type CardType = 'FLASHCARD' | 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'MINI_GAME';

export type MiniGameType = 'CATEGORY_SORT' | 'SEQUENCE_BUILD' | 'MATCH_PAIRS';

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

/**
 * Match Pairs is a strict 1:1 permutation: every left concept has exactly one
 * matching right concept. Distractors are intentionally NOT supported here —
 * the player rearranges the right column to align rows with their left labels.
 */
export interface MatchPairsContent {
  gameType: 'MATCH_PAIRS';
  prompt: string;
  pairs: { id: string; left: string; right: string }[];
  explanation: string;
}

export type MiniGameContent = CategorySortContent | SequenceBuildContent | MatchPairsContent;

export interface Card {
  id: string;
  type: CardType;
  difficulty: number;
  conceptTarget?: string;
  content: FlashcardContent | SingleChoiceContent | MultiChoiceContent | MiniGameContent;
}

export interface TopicCardGroup {
  topicId: string;
  cards: Card[];
}

/** Stable identity for a topic within the deck (subject + topic node id). */
export interface TopicRef {
  subjectId: string;
  topicId: string;
}

/** Stable identity for a card within the deck (topic + per-file card id). */
export interface CardRef {
  subjectId: string;
  topicId: string;
  cardId: string;
}

export interface ActiveCrystal {
  subjectId: string;
  topicId: string;
  gridPosition: [number, number];
  xp: number;
  spawnedAt: number;
}
