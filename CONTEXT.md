# Abyss Engine Learning Garden

Abyss Engine turns spaced-repetition study into a 3D crystal garden where subjects become curriculum graphs, topics become crystals, and review progress grows those crystals. This context gives architecture reviews stable product-domain language so suggestions use the same names as the learning garden.

## Language

### Learning Garden

**Crystal Garden**:
The product metaphor where study progress appears as growing crystals in a mystical abyss.
_Avoid_: Dashboard, course list, learning app

**Subject**:
A learner-facing course container with generation strategy, visual identity, and topics.
_Avoid_: Deck, course service, syllabus object

**Subject Graph**:
The persisted curriculum graph for one subject.
_Avoid_: Scene graph, dependency graph, topic tree

**Topic Lattice**:
The Stage A curriculum output containing topics, tiers, icons, and objectives before prerequisite edges exist.
_Avoid_: Draft graph, partial graph, topic list

**Topic**:
A curriculum unit inside a subject, represented as a graph node and visualized as a crystal.
_Avoid_: Lesson, node, deck item

**Prerequisite Edge**:
A curriculum requirement that one topic crystal must reach a minimum crystal level before another topic unlocks.
_Avoid_: Dependency, link, parent relation

**Crystal**:
The progression avatar for a topic in the crystal garden.
_Avoid_: Node, tile, progress marker

**Crystal Level**:
The XP-derived progression level of a topic crystal.
_Avoid_: Level, tier, difficulty

### Study Progression

**Study Session**:
The active queue of cards being reviewed for one topic.
_Avoid_: Session, quiz run, review loop

**Card Review**:
A learner's rated answer attempt for one card during a study session.
_Avoid_: Submission, response, interaction

**SM-2 State**:
The per-card spaced-repetition schedule that determines future review timing.
_Avoid_: Card memory, review metadata, schedule blob

**Coarse Rating**:
The flashcard path that converts recalled-or-forgot choices, timing, hints, and difficulty into an internal 1-4 rating.
_Avoid_: Binary rating, flashcard score, quick answer

**Unlock Points**:
The spendable progression resource used to unlock new topics.
_Avoid_: Currency, mana, points

**Resonance Points**:
The earn-only meta-currency tracked across study progress.
_Avoid_: Unlock points, XP, reward points

### Rituals And Rewards

**Attunement Ritual**:
The pre-study readiness ritual that produces harmony, a readiness bucket, and buffs.
_Avoid_: Ritual, checklist, warmup

**Harmony**:
The readiness score produced by an attunement ritual.
_Avoid_: Score, mood, focus

**Readiness Bucket**:
The low, medium, or high readiness category derived from harmony.
_Avoid_: Tier, rank, state

**Buff**:
A temporary or conditional modifier that changes study rewards or behavior.
_Avoid_: Bonus, power-up, effect

**Crystal Trial**:
A level-gating assessment for crystal progression.
_Avoid_: Quiz, test, checkpoint

### Generated Learning Content

**Topic Content**:
The generated theory, study cards, and mini-games attached to a topic.
_Avoid_: Content, lesson content, study panel content

**Topic Content Status**:
The ready, generating, or unavailable state used to gate whether a topic can be studied.
_Avoid_: Content state, availability, generation status

**Content Generation Job**:
One LLM prompt invocation with lifecycle status, lineage, output, errors, and metadata.
_Avoid_: Job, request, generation task

**Topic Content Pipeline**:
The ordered generation of theory, study cards, and mini-games for a topic.
_Avoid_: Pipeline, content flow, topic generation

**Subject Graph Generation**:
The two-stage process that creates a topic lattice and then wires prerequisite edges.
_Avoid_: Graph generation, curriculum generation, subject pipeline

**Topic Expansion**:
The generation of additional cards triggered by crystal progression.
_Avoid_: Expansion, level content, follow-up cards

**Learning Content Store**:
The backend-authoritative persistence surface for Subjects, Subject Graphs, Topic Content, study cards, and generated Crystal Trial question sets. The browser reads learning content from this store and no longer owns generation-pipeline persistence.
_Avoid_: Local deck, browser cache, generated content cache

### Guidance And Signals

**Mentor**:
The in-product guidance persona that reacts to learning events and can trigger study effects through composition adapters.
_Avoid_: Assistant, coach, chatbot

**App Event Bus**:
The typed in-browser domain event channel used to coordinate feature reactions.
_Avoid_: Event bus, global events, pubsub

**Telemetry**:
The typed product signal stream used to record learning and generation behavior.
_Avoid_: Analytics, tracking, logging

**Player Profile**:
The learner identity surface that can be enriched by infrastructure analytics adapters.
_Avoid_: User profile, analytics profile, account

## Relationships

- A **Subject** has exactly one persisted **Subject Graph**.
- A **Subject Graph** contains many **Topics**.
- A **Topic Lattice** becomes a **Subject Graph** after **Prerequisite Edges** are added and validated.
- A **Topic** is visualized as one **Crystal**.
- A **Crystal** has one **Crystal Level** derived from XP.
- A **Prerequisite Edge** can require a source **Crystal** to reach a minimum **Crystal Level**.
- A **Study Session** reviews cards from exactly one **Topic**.
- A **Card Review** updates **SM-2 State** and may produce XP for the **Crystal**.
- An **Attunement Ritual** produces **Harmony**, one **Readiness Bucket**, and zero or more **Buffs**.
- **Unlock Points** unlock **Topics**; **Resonance Points** are earned but not spent.
- **Topic Content** is produced by a **Topic Content Pipeline**.
- A **Topic Content Pipeline** consists of one or more **Content Generation Jobs**.
- **Subject Graph Generation** produces a **Topic Lattice** before prerequisite wiring.
- **Topic Expansion** adds study cards when crystal progression calls for more material.
- A **Crystal Trial** gates progression toward a target **Crystal Level**.
- The **Learning Content Store** persists generated Subjects, Subject Graphs, Topic Content, study cards, and Crystal Trial question sets after durable backend workflows validate artifacts.
- The **Mentor** reacts to events carried by the **App Event Bus**.
- **Telemetry** records product-domain signals without owning analytics deployment details.

## Example Dialogue

> **Dev:** "When a learner creates a **Subject**, do we immediately have a **Subject Graph**?"
> **Domain expert:** "Not until **Subject Graph Generation** finishes both the **Topic Lattice** and **Prerequisite Edge** stages."
>
> **Dev:** "Can a locked **Topic** still have **Topic Content**?"
> **Domain expert:** "Yes, **Topic Content Status** tells us whether the material exists, while **Prerequisite Edges** and **Unlock Points** decide whether the **Topic** can be studied."
>
> **Dev:** "Should a review module talk about card level?"
> **Domain expert:** "Use **Card Review** for the attempt and **Crystal Level** for progression; card difficulty is not a level."

## Flagged Ambiguities

- "stage" can mean a **Topic Content Pipeline** stage (`theory`, `study-cards`, `mini-games`, `full`) or a **Subject Graph Generation** stage (`topics`, `edges`); always name the specific process.
- "level" can mean **Crystal Level**, graph tier, card difficulty, trial target level, or expansion target; prefer **Crystal Level** unless another term is exact.
- "graph" can mean **Subject Graph** or the Three.js scene graph; use **Subject Graph** for curriculum and "scene graph" for rendering.
- "content" can mean **Topic Content**, card content, study panel UI, or generation output; use the narrowest term.
- "session" can mean **Study Session**, telemetry session metadata, or pomodoro timing; use **Study Session** only for card review queues.
- "ritual" should mean **Attunement Ritual** unless another ritual is explicitly introduced.
- "pipeline" should be qualified as **Topic Content Pipeline** or **Subject Graph Generation**.
- "analytics" should not be used for product-domain events; use **Telemetry** for product signals and PostHog adapter language only when discussing infrastructure.
