# Mini-Game Shared Infrastructure Plan

## Overview

Shared types, hooks, evaluation harness, LLM generation surface, and D3 rendering foundation for all interactive mini-games. Each mini-game is a thin D3 renderer that composes these shared primitives.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Study flow | New `MINI_GAME` CardType in session queue | Reuses entire session/SM-2/XP pipeline |
| Render surface | Inline in AbyssDialog (study panel) | Near-fullscreen on mobile, consistent with study flow |
| LLM generation | Separate generation surface (like AscentWeaver) | Mini-game generation needs higher compute; batch generation per topic |
| Scoring | Binary ≥80% → correct (rating 3), else incorrect (rating 1) | Consistent with existing MCQ binary mapping |
| Touch interaction | Tap-to-select, tap-to-place (no drag) | Mobile-first; avoids scroll conflicts |
| Component architecture | Shared hooks + thin renderers per game type | DRY force simulation, interaction state, feedback animations |
| Visual style | Clean/functional with Tailwind tokens | Readability and interaction clarity first |

---

## 1. Type System Extensions

### `src/types/core.ts`

```typescript
export type CardType = 'FLASHCARD' | 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'MINI_GAME';

export type MiniGameType = 'CATEGORY_SORT' | 'SEQUENCE_BUILD' | 'CONNECTION_WEB';

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
```

Extend the `Card` interface's `content` union to include `MiniGameContent`.

### `src/types/miniGame.ts` (new)

```typescript
export type MiniGamePhase = 'playing' | 'submitted' | 'reviewed';

export interface MiniGamePlacement {
  itemId: string;
  targetId: string;
}

export interface MiniGameResult {
  totalItems: number;
  correctItems: number;
  score: number;         // 0-1
  isCorrect: boolean;    // score >= 0.8
  placements: MiniGamePlacement[];
}
```

---

## 2. Shared Hooks

### `src/hooks/useMiniGameInteraction.ts`

Manages tap-to-select, tap-to-place state machine for all game types.

**State:**

```typescript
interface MiniGameInteractionState {
  selectedItemId: string | null;     // currently tapped/highlighted item
  placements: Map<string, string>;   // itemId → targetId
  phase: MiniGamePhase;              // playing | submitted | reviewed
  correctItemIds: Set<string>;       // populated after submission
  incorrectItemIds: Set<string>;     // populated after submission
}
```

**API:**

```typescript
function useMiniGameInteraction(config: {
  itemIds: string[];
  evaluateFn: (placements: Map<string, string>) => MiniGameResult;
}): {
  // State
  selectedItemId: string | null;
  placements: ReadonlyMap<string, string>;
  phase: MiniGamePhase;
  correctItemIds: ReadonlySet<string>;
  incorrectItemIds: ReadonlySet<string>;
  result: MiniGameResult | null;

  // Actions
  selectItem: (itemId: string) => void;      // tap an unplaced item → highlight
  placeItem: (targetId: string) => void;      // tap a target → place selected item
  removeItem: (itemId: string) => void;       // tap a placed item → return to pool
  submit: () => void;                         // evaluate placements
  reset: () => void;                          // clear all placements

  // Derived
  unplacedItemIds: string[];
  isComplete: boolean;                        // all items placed
  canSubmit: boolean;                         // all items placed && phase === 'playing'
}
```

**Interaction flow:**

1. Tap unplaced item → `selectItem(itemId)` → highlights it
2. Tap target zone → `placeItem(targetId)` → item moves to zone, deselects
3. Tap placed item → `removeItem(itemId)` → returns to pool
4. Tap "Submit" → `submit()` → runs `evaluateFn`, populates correct/incorrect sets
5. Phase moves to `'submitted'` → UI shows feedback → Continue button calls `onSubmitResult`

### `src/hooks/useMiniGameSvgContainer.ts`

Shared responsive SVG setup for all D3 mini-games.

**API:**

```typescript
function useMiniGameSvgContainer(config?: {
  aspectRatio?: number;  // default 4/3
  minHeight?: number;    // default 280
  maxHeight?: number;    // default 420
}): {
  containerRef: RefObject<HTMLDivElement>;
  svgRef: RefObject<SVGSVGElement>;
  width: number;
  height: number;
}
```

Uses `ResizeObserver` on the container div to derive SVG dimensions. The SVG fills the container width and computes height from aspect ratio, clamped to min/max.

---

## 3. Card Presenter Extension

### `src/features/studyPanel/cardPresenter.ts`

```typescript
export type RenderableType = 'flashcard' | 'single_choice' | 'multi_choice' | 'mini_game';

export interface RenderableCard {
  id: string;
  type: RenderableType;
  question: string;
  answer?: string;
  options?: string[];
  correctAnswers?: string[];
  context?: string;
  miniGame?: MiniGameContent;  // populated when type === 'mini_game'
}
```

Add a `MINI_GAME` branch in `toRenderableCard`:

```typescript
if (card.type === 'MINI_GAME') {
  const content = card.content as MiniGameContent;
  return {
    id: card.id,
    type: 'mini_game',
    question: content.prompt,
    context: content.explanation,
    miniGame: content,
  };
}
```

---

## 4. Evaluation Harness

### `src/features/content/evaluateMiniGame.ts`

```typescript
import { MiniGameContent, CategorySortContent, SequenceBuildContent, ConnectionWebContent } from '../../types/core';
import { MiniGameResult, MiniGamePlacement } from '../../types/miniGame';

const CORRECT_THRESHOLD = 0.8;

export function evaluateMiniGame(
  content: MiniGameContent,
  placements: Map<string, string>,
): MiniGameResult {
  switch (content.gameType) {
    case 'CATEGORY_SORT':
      return evaluateCategorySort(content, placements);
    case 'SEQUENCE_BUILD':
      return evaluateSequenceBuild(content, placements);
    case 'CONNECTION_WEB':
      return evaluateConnectionWeb(content, placements);
  }
}

// itemId → categoryId
function evaluateCategorySort(content: CategorySortContent, placements: Map<string, string>): MiniGameResult { ... }

// itemId → position string ("0", "1", "2", ...)
function evaluateSequenceBuild(content: SequenceBuildContent, placements: Map<string, string>): MiniGameResult { ... }

// leftId → rightId
function evaluateConnectionWeb(content: ConnectionWebContent, placements: Map<string, string>): MiniGameResult { ... }

export function miniGameResultToIsCorrect(result: MiniGameResult): boolean {
  return result.score >= CORRECT_THRESHOLD;
}
```

### `src/features/content/evaluateAnswer.ts` — extend

Add a branch for `MINI_GAME` that delegates to `evaluateMiniGame`. Or keep `evaluateAnswer` for choice types only and let `StudyPanelModal` call `evaluateMiniGame` directly for mini-game cards (cleaner separation).

**Recommended: keep them separate.** `evaluateAnswer` stays pure for SC/MC. `evaluateMiniGame` is a new export from `features/content/`.

---

## 5. StudyPanelModal Integration

### Detection in `StudyPanelModal.tsx`

```typescript
const isMiniGame = model.renderedCard?.type === 'mini_game';
```

When `isMiniGame && activeTab === 'study'`:
- Render `<MiniGameView>` instead of `<StudyPanelStudyView>`
- `MiniGameView` receives `renderedCard.miniGame` content
- On game completion: calls `onSubmitResult(cardId, isCorrect)` — same path as MCQ

### `src/components/studyPanel/MiniGameView.tsx` (new)

Thin orchestrator that:
1. Receives `MiniGameContent` + `onComplete(isCorrect: boolean)` + `onContinue()`
2. Switches on `content.gameType` to render the correct D3 component
3. Uses `useMiniGameInteraction` for shared state
4. Renders submit/continue buttons consistent with existing study panel UX
5. Shows explanation text after submission (from `content.explanation`)

```
<MiniGameView>
  ├── <prompt text>
  ├── <D3 game component>  ← switches on gameType
  ├── <submit / continue button>
  └── <explanation (post-submit)>
</MiniGameView>
```

---

## 6. LLM Generation Surface

### New Inference Surface

`src/types/llmInference.ts`:

```typescript
export type InferenceSurfaceId =
  | 'studyQuestionExplain'
  | 'studyFormulaExplain'
  | 'studyQuestionMermaid'
  | 'screenCaptureSummary'
  | 'ascentWeaver'
  | 'miniGameWeaver';   // new
```

Route to Gemini in `llmInferenceSurfaceProviders.ts` (same as AscentWeaver — higher compute).

### Feature Module: `src/features/miniGameWeaver/`

Following the AscentWeaver pattern:

```
src/features/miniGameWeaver/
  ├── index.ts
  ├── buildMiniGameMessages.ts         // prompt builder
  ├── parseMiniGameResponse.ts         // JSON extraction + Zod parse
  ├── miniGameContentSchema.ts         // Zod schemas
  ├── validateMiniGameContent.ts       // domain validation
  └── applyMiniGamesToIndexedDb.ts     // persist via deckContentWriter
```

### Prompt Template: `src/prompts/mini-game-generate.prompt`

```
Act as an expert educator and game designer. Generate interactive mini-games
for the topic described below.

Topic: {{topicId}} — "{{topicTitle}}"
Subject: {{subjectTitle}}
Core concept: {{coreConcept}}
Key takeaways: {{keyTakeaways}}
Target audience: {{audience}}

Generate exactly {{gameCount}} mini-games. For each game, choose the most
pedagogically appropriate type from: CATEGORY_SORT, SEQUENCE_BUILD, CONNECTION_WEB.

Requirements:
- Each game must test understanding of the topic's core concepts
- Items must be concise (≤8 words each) for mobile readability
- Category Sort: 2-4 categories, 6-10 items
- Sequence Build: 4-8 items
- Connection Web: 4-7 pairs, 0-2 distractors per side
- Distractors must be plausible to test deep understanding
- Include a clear explanation for each game

Output ONLY valid JSON matching this schema:
{
  "topicId": "{{topicId}}",
  "games": [
    {
      "gameType": "CATEGORY_SORT",
      "prompt": "Sort these into the correct category",
      "categories": [{ "id": "cat-1", "label": "Category Name" }],
      "items": [{ "id": "item-1", "label": "Item Name", "categoryId": "cat-1" }],
      "explanation": "Why items belong to their categories..."
    }
  ]
}
```

### Zod Schema: `src/features/miniGameWeaver/miniGameContentSchema.ts`

Validate `gameType` discriminator, required fields per type, item count constraints, referential integrity (all `categoryId` values reference valid categories, all `correctPosition` values are unique and sequential, etc.).

### Hook: `src/hooks/useMiniGameWeaver.ts`

Mirrors `useAscentWeaverCurriculumGraph`:

```typescript
function useMiniGameWeaver({ chat, writer }: { chat: IChatCompletionsRepository; writer: IDeckContentWriter }) {
  // streaming state, generation ref, error state
  // generateAndApply(input) → stream → parse → validate → merge into topic's cards in IndexedDB
}
```

The generated mini-game content is converted to `Card` objects with `type: 'MINI_GAME'` and appended to the topic's existing cards via `upsertTopicCards`.

---

## 7. D3 Rendering Foundations

### Shared SVG Patterns

All mini-games render inside an `<svg>` element managed by `useMiniGameSvgContainer`. Shared visual primitives:

**Node rendering:**
- Rounded rect with label text (truncated with ellipsis if needed)
- States: `default`, `selected` (ring highlight), `placed`, `correct` (green), `incorrect` (red)
- Use Tailwind CSS variable colors: `--color-primary`, `--color-destructive`, `--color-muted`, etc.

**Zone rendering:**
- Dashed-border rect/circle target areas
- States: `empty`, `hovering` (item selected and zone is valid target), `filled`
- Label text above or inside zone

**Feedback animations:**
- Correct: brief green flash + scale pulse on the item
- Incorrect: brief red flash + horizontal shake
- Use D3 transitions (already imported via `d3-transition`)

**Touch events:**
- All interactive elements use `pointer-events` and `pointerdown` / `click`
- No `mouseover`-dependent styling (mobile-first rule from CLAUDE.md)
- Minimum touch target: 44x44px

### File Structure

```
src/components/miniGames/
  ├── MiniGameView.tsx                  // orchestrator (switches on gameType)
  ├── shared/
  │   ├── MiniGameSvgContainer.tsx      // responsive SVG wrapper
  │   ├── MiniGameNode.tsx              // SVG group: rect + label + state styling
  │   ├── MiniGameZone.tsx              // SVG group: dashed target area
  │   ├── MiniGameItemPool.tsx          // unplaced items area (bottom of SVG)
  │   └── miniGameColors.ts            // color tokens from CSS variables
  ├── CategorySortGame.tsx              // D3 renderer
  ├── SequenceBuildGame.tsx             // D3 renderer
  └── ConnectionWebGame.tsx             // D3 renderer
```

---

## 8. Session Queue Integration

### Card Ordering

Mini-game cards are mixed into the regular session queue. They follow the same SM-2 scheduling and difficulty gating as other card types. The `difficulty` field on the `Card` object controls when mini-games appear relative to crystal level.

### Difficulty Strategy

LLM-generated mini-games should span **all difficulty levels (1-4)**, matching the topic's progression curve:
- **Difficulty 1**: Foundational sorting/classification (appears immediately alongside introductory flashcards)
- **Difficulty 2**: Intermediate concepts requiring multi-step reasoning
- **Difficulty 3-4**: Advanced edge cases, subtle distinctions, and cross-topic synthesis

This ensures mini-games reinforce learning at every stage of crystal growth rather than clustering at a single tier.

---

## 9. Testing Strategy

### Unit Tests

| Module | Test File | Coverage |
|---|---|---|
| `evaluateMiniGame` | `evaluateMiniGame.test.ts` | All three game type evaluators, edge cases (empty placements, partial correct, threshold boundary) |
| `useMiniGameInteraction` | `useMiniGameInteraction.test.ts` | State transitions: select→place→remove→submit→reset, phase guards |
| `miniGameContentSchema` | `miniGameContentSchema.test.ts` | Zod validation for each game type, referential integrity checks |
| `parseMiniGameResponse` | `parseMiniGameResponse.test.ts` | JSON extraction from fenced/raw text, malformed input handling |
| `toRenderableCard` | Extend existing test | `MINI_GAME` branch returns correct `miniGame` field |

### Component Tests

| Component | Coverage |
|---|---|
| `MiniGameView` | Renders correct game component per `gameType`, submit/continue flow |
| Each D3 game | SVG renders expected node/zone count, tap interactions update state |

---

## 10. Files Changed Summary

### New Files

| Path | Layer | Purpose |
|---|---|---|
| `src/types/miniGame.ts` | Types | Game phases, placements, results |
| `src/hooks/useMiniGameInteraction.ts` | Composition | Tap-to-select/place state machine |
| `src/hooks/useMiniGameSvgContainer.ts` | Composition | Responsive SVG dimensions |
| `src/hooks/useMiniGameWeaver.ts` | Composition | LLM generation hook |
| `src/features/content/evaluateMiniGame.ts` | Features | Scoring harness |
| `src/features/miniGameWeaver/` | Features | LLM generation pipeline |
| `src/prompts/mini-game-generate.prompt` | Prompts | LLM prompt template |
| `src/components/miniGames/` | Presentation | D3 renderers + shared SVG primitives |

### Modified Files

| Path | Change |
|---|---|
| `src/types/core.ts` | Add `MINI_GAME` to `CardType`, add content interfaces |
| `src/types/llmInference.ts` | Add `'miniGameWeaver'` to `InferenceSurfaceId` |
| `src/features/studyPanel/cardPresenter.ts` | Add `mini_game` to `RenderableType`, add `miniGame` field, add branch in `toRenderableCard` |
| `src/features/content/index.ts` | Re-export `evaluateMiniGame` |
| `src/infrastructure/llmInferenceSurfaceProviders.ts` | Route `miniGameWeaver` to provider |
| `src/components/StudyPanelModal.tsx` | Detect mini-game cards, render `MiniGameView` |
| `src/hooks/useStudyPanelModel.ts` | Add `isMiniGame` derived flag |
