# Incremental LLM Generation Flow

## Vision
A seamless, minimal-input UX where users specify what they want to learn in a single sentence, and the Abyss Engine builds the curriculum graph and generates content (cards/mini-games) just-in-time and look-ahead based on their progression.

## 1. Initial Subject Spawning (The "One Input" UX)
**Trigger**: User enters a single text prompt: "What do you want to learn?" (e.g., "Machine Learning Math").
**Process**:
- **LLM Call 1 (Curriculum Structure)**: 
  - Infers subject metadata (Name, Description, Color, Theme).
  - Generates the `SubjectGraph`, but **restricted to Tier 1 and Tier 2 nodes only** to minimize initial latency.
- **Storage**: Persist the Subject and stubbed Topics to IndexedDB.
- **UX**: User immediately drops into the 3D garden and sees the Tier 1 and Tier 2 crystals. Content is marked "Not available yet".

## 2. On-Demand Generation (Upon Topic Unlock)
**Trigger**: User clicks "Unlock & Spawn" in the `TopicDetailsPopup`.
**Process**:
- **LLM Call 2 (Theory & Core Questions)**:
  - Generates the Topic `theory`, `coreConcept`, and `keyTakeaways`.
  - Generates a categorized list of "Most Important Questions" mapped to Difficulties 1, 2, and 3 based on the theory.
- **LLM Call 3 & 4 (Parallel - Difficulty 1)**:
  - Using the Difficulty 1 questions, concurrently generate **Difficulty 1 Cards** and **Difficulty 1 Mini-Games**.
- **Storage**: 
  - Save Theory, Cards, and Mini-Games to IndexedDB.
  - **Permanently save the "Core Questions"** into the Topic schema in IndexedDB (requires updating `TopicDetails` interface in `core.ts` and IDB schema).
- **UX**: 
  - Show a "Synthesizing Knowledge..." loader on the specific crystal. 
  - The Core Questions will be visible as a "Syllabus" in the topic UI once generated.
  - Once the Difficulty 1 cards are ready, the study session begins.

## 3. Lookahead Generation (Background Deep Mastery)
**Trigger**: A crystal levels up (i.e. `useProgressionStore` emits a `crystal-level-up` event).
**Process**:
- **LLM Call 5 (Background Difficulty Expansion)**:
  - Check the newly attained level (e.g. Level 2).
  - Grab the permanent "Core Questions" syllabus from the Topic schema for that corresponding Difficulty level.
  - Trigger a background generation for Cards and Mini-games matching the new Difficulty level.
- **Storage**: Silently append new cards and games to the topic's deck in IndexedDB (requires a new `appendTopicCards` method in `IDeckContentWriter`).
- **UX / HUD**:
  - Add a subtle background generation progress indicator and status text to the main screen HUD.
  - Clicking the HUD indicator opens a generation progress log.
  - If the user closes the app or navigates away while generation is running, the task is aborted gracefully. It will trigger again lazily on-demand if the user tries to study the new difficulty level before it exists.
  - It is acceptable that cards/games generating in the background are invisible until generation completes.

## 4. Graph Expansion (Tier 3+)
*Deferred to future implementation. The system will eventually expand the graph based on user progress.*