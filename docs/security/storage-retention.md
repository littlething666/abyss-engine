# R2 Artifact Retention & Lifecycle Policy

**Last updated:** 2026-05-07
**Status:** Phase 4 — productionization
**Bucket:** Cloudflare R2 `abyss-generation-artifacts`

## Storage model

Artifacts and checkpoints are stored in Cloudflare R2 under these path patterns:

```
abyss/{deviceId}/{kind}/{schemaVersion}/{inputHash}.json
abyss/{deviceId}/{kind}/{runId}/checkpoint-{stage}.json
abyss/{deviceId}/{kind}/{runId}/raw-primary.json
abyss/{deviceId}/{kind}/{runId}/raw-repair.json
```

Each artifact is a JSON envelope:

```ts
{
  artifactId: string;       // UUID
  runId: string;            // UUID of producing run
  deviceId: string;         // scoped to device
  kind: ArtifactKind;       // e.g. 'crystal-trial', 'topic-theory'
  inputHash: string;        // inp_<sha256-hex>
  contentHash: string;      // cnt_<sha256-hex>
  schemaVersion: number;    // integer, incremented on schema changes
  artifact: ArtifactPayload; // parsed, validated content
  createdAt: string;        // ISO 8601
}
```

## Deduplication

The D1 `artifacts` table enforces uniqueness on `(device_id, kind, input_hash)`:

- Identical input snapshots produce the same `input_hash` and therefore the
  same R2 object key.
- The D1 `artifacts` unique constraint prevents duplicate rows.
- The Worker checks `artifacts(device_id, kind, input_hash)` before creating a
  Workflow — on cache hit it creates a run referencing the existing
  artifact without making an LLM call.

**Implication for object storage:** each `(deviceId, kind, inputHash)` pair
occupies at most one blob. Repeated identical runs do not create new blobs.

## Retention tiers

### Tier 1: Active retention (default)

**What:** All artifacts for active devices.
**Duration:** Indefinite while device is active.
**Trigger:** Device records a `last_seen_at` within the last 90 days.

### Tier 2: Inactive device archival

**What:** Artifacts for devices with `last_seen_at > 90 days ago`.
**Duration:** 180 days from last seen.
**Action:** Artifacts remain in R2 but are soft-deleted from the
`artifacts` D1 table (cache misses regenerate on next request).
**Trigger:** Cloudflare Cron Trigger or an operator-run cleanup job.

### Tier 3: Permanent deletion

**What:** Artifacts for devices with `last_seen_at > 270 days ago` (9 months).
**Action:** R2 objects deleted; D1 rows hard-deleted.
**Trigger:** Scheduled cleanup job.

## Implementation (Phase 4)

### Schema extension

Add to `artifacts` table:
```sql
ALTER TABLE artifacts ADD COLUMN retention_tier TEXT NOT NULL DEFAULT 'active';
ALTER TABLE artifacts ADD COLUMN retention_updated_at TEXT NOT NULL;
```

### Cleanup job (Cloudflare scheduled Worker)

```sql
-- Tier 1 → Tier 2: devices inactive > 90 days
UPDATE artifacts
SET retention_tier = 'archived'
FROM devices
WHERE artifacts.device_id = devices.id
  AND artifacts.retention_tier = 'active'
  AND devices.last_seen_at < ?;

-- Tier 2 → Tier 3: devices inactive > 270 days
UPDATE artifacts
SET retention_tier = 'deleted'
FROM devices
WHERE artifacts.device_id = devices.id
  AND artifacts.retention_tier = 'archived'
  AND devices.last_seen_at < ?;

-- Hard delete tier 3 rows
DELETE FROM artifacts WHERE retention_tier = 'deleted';
```

### R2 cleanup (Worker or external job)

After D1 rows are deleted, a separate process removes blobs from
R2:

```ts
// Pseudo: list all R2 keys,
// cross-reference with D1 artifacts table, delete orphans.
```

Phase 4 can start with a manual cleanup process; automation lands with
the scheduled Worker cleanup integration.

## Artifact versioning

When a pipeline's schema version increments (e.g., `crystalTrialSchemaVersion`
changes from 1 to 2), existing artifacts with the old schema remain valid for
cache-hit purposes. The `input_hash` incorporates `schema_version`, so a
schema version change produces a different `input_hash` — old artifacts are
never returned for new schema versions. Old artifacts are eligible for
retention cleanup according to the tier policy above.

## Cost estimates (v1, single-digit active users)

| Component | Monthly estimate |
|---|---|
| Cloudflare R2 (1000 artifacts × 5KB avg) | ~5 MB stored → free tier |
| Cloudflare D1 (artifact metadata, indexed) | ~10 MB → free tier |
| Egress (artifact reads proxied through Worker) | ~50 MB/month → free tier |

No immediate cost pressure for retention. Policy exists to prevent unbounded
growth in the long tail.
