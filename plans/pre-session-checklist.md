# 🧠 Attunement Ritual – Pre-Session Checklist

**Goal:** Align your energy → unlock stronger crystal growth and Clarity Buff this session.

### 1. Biological Foundation (Stamina / Mana)
- [ ] **The Stamina Check:** Did I sleep ≥7h last night? (≤5h → auto Shallow Work mode + lower Mana)
- [ ] **The Fuel Factor:** Have I eaten protein/complex carbs in the last 3 hours?
- [ ] **Movement Reset:** 5+ minutes of movement since last long sit?

### 2. Cognitive Environment (Clarity Buff)
- [ ] **Digital Silence:** Phone on DND or in another room.
- [ ] **Single-Tasking + Visual Clarity:** Unrelated tabs closed and desk decluttered.
- [ ] **Lighting & Air:** Room ventilated and lighting comfortable?

### 3. Quest Intent (Atomic Focus)
- [ ] **Target Crystal:** Which specific topic/sector am I growing today? (links to Wisdom Altar)
- [ ] **Micro-Goal:** What is the single measurable outcome? (e.g. “Master 10 Linear Algebra cards”)
- [ ] **Pre-Session Confidence:** Rate 1–5 how ready I feel.

**→ Click “Begin Attunement”**
*Harmony Score calculated (affects XP multiplier and crystal growth intensity this session).*

### 4. Runtime mapping & persistence
- `[Harmony Score]` is normalized to 0–100 and bucketed as **Low / Medium / High**.
  - High readiness applies: `xp_multiplier` and/or `growth_speed` buffs.
  - Medium readiness applies: mostly `clarity_boost` when environmental checks are good.
  - Low readiness applies: no buffs, maintain baseline cadence.
- On submit, payload is persisted into `attunementSessions` with:
  - topicId
  - checklist response snapshot
  - calculated harmony score
  - bucket
  - derived buffs
- Session card telemetry is appended into the same session record as each card is submitted.
- If ritual submission is skipped/abandoned, the topic stays unchanged and no `attunementSession` is created; starting a topic normally still works with neutral defaults.
