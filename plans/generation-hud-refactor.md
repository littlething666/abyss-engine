# Implementation Plan: Move Generation Indicator to Scene HUD & Enhance Modal

## I. Architectural Alignment Assessment
**Misalignment Check**: Full alignment with CLAUDE.md confirmed — zero deviations detected. 
- *Target Pattern*: Presentation & Orchestration (`src/components/`, `app/page.tsx`).
- *Boundary Verification*: We are extracting a shared presentation component for Generation I/O and moving an existing HUD element. No feature boundaries are crossed. State accesses remain scoped to the same Zustand stores.
- *State Strategy*: Utilizing existing `useTopicGenerationStore` and `useBackgroundGenerationStore`.

**Architectural Risk Highlight**:
- **Risk (Low)**: Cluttering `app/page.tsx` with more modals/overlays.
  - *Mitigation*: The `GenerationProgressHud` will contain its own modal or use a separate cohesive modal component, keeping `app/page.tsx` clean.
- **Risk (Low)**: Code duplication for the Generation I/O view.
  - *Mitigation*: Extract `GenerationIoSection` from `TopicDetailsPopup` into a shared component to ensure DRY principles.

**Prompt Drift Prevention**:
- Added strict adherence to moving logic strategically into shared UI components instead of duplicating `TopicDetailsPopup` logic.

## II. Implementation Steps

### Step 1: Extract `GenerationIoSection` to a shared component
- **File**: `src/components/TopicDetailsPopup.tsx`
- **Action**: Remove the local `GenerationIoSection` and `CopyableLlmTextBlock` usage here.
- **File**: Create `src/components/GenerationIoSection.tsx`
- **Action**: Move `GenerationIoSection` here. It will accept a `TopicGenerationIoLog` and optional topic metadata to render the inputs, outputs, errors, and status.

### Step 2: Move the Indicator to the Scene HUD Overlay (Top Right)
- **File**: `app/page.tsx`
- **Action**: Move `<GenerationProgressHud />` from its isolated absolute container into the existing top-right HUD overlay container, placing it *above* the `<StatsOverlay />`.
- **File**: `src/components/GenerationProgressHud.tsx`
- **Action**: Update the visual footprint of the indicator to be a compact HUD element (e.g., an icon button or a sleek pill) suitable for the top-right overlay. 
- **Action**: Change the display logic so it is *always visible* (e.g., an active/inactive icon), allowing users to open the generation logs even when idle.

### Step 3: Enhance the Generation Info Modal
- **File**: `src/components/GenerationProgressHud.tsx`
- **Action**:
  - Refactor the internal `AbyssDialog` to render a more comprehensive "Generation Info" view featuring tabs or a split view.
  - Hook into `useTopicGenerationStore` to retrieve `generationIoLogByTopicId`.
  - Limit the displayed Generation I/O logs to the **last 10 generations** (sort by `startedAt` descending, slice top 10).
  - Render both the raw background string log (from `useBackgroundGenerationStore`) AND the structured Generation I/O for each recent topic generation.
  - Display the topic name/subject alongside its Generation I/O by querying the local deck data (e.g., using `useTopicDetails` or by deriving from `subjectId` and `topicId`).

## III. Questions for the User
The plan is updated based on your answers.

*   Are we ready to proceed with writing the code, or are there any final tweaks to the modal UI design (e.g., tabs vs continuous scroll for the logs)?