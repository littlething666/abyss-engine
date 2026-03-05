
## Metrics

### 1. The Cognitive Readiness Score (CRS)
How it's calculated: A weighted normalized score from `AttunementPayload.checklist`.
Source:
- `sleepHours`
- `ateFuel`
- `movementMinutes`
- `digitalSilence`
- `visualClarity`
- `lightingAndAir`
- `confidenceRating`
- `targetCrystal`
- `microGoal`

Buckets:
- **Low**: 0–49
- **Medium**: 50–74
- **High**: 75–100

**Usage**: Drives readiness output in overlay and selects active buff list for adaptive hooks.

### 2. Environmental Friction Index
Tracking missed checklist fields by rolling window (for now: aggregated from `attunementSessions` checklist snapshots).

**Usage**: Identify correlation between repeated misses and session performance (correctness / completion velocity).

### 3. Streaks (correct, days, difficult)
**Usage**: Derived from card-level telemetry stored in each `attunementSession`: `attempts`, `correctRate`, `sessionDurationMs`.

### 4. Time per card
Source:
- `attempt.timestamp` deltas between cards in `attunementSessions.attempts`.

### 5. Number of cards per session
Source:
- `attunementSession.totalAttempts` plus `attunementSession.correctRate`.

**Usage**: Session completeness and fatigue heuristics; used as guardrail for adaptive future recommendations.

### 6. Number of cards per topic
- Source: topic-specific grouping from `attunementSessions` records and `currentSession.queueCardIds`.

### 7. Correct % per session
Source:
- `attunementSession.correctRate`

### 8. Correct % per topic
Source:
- Aggregate `attunementSessions` by `topicId`.

### 9. Correct % per card (suggest to break down the card)
Source:
- Card-level outcomes from `attunementSessions.attempts`:
  - `cardId`
  - `rating`
  - `isCorrect`
