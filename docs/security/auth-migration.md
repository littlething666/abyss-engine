# Account Auth Migration Plan

**Last updated:** 2026-05-07
**Status:** Phase 4 — planning (implementation deferred to Phase 4+)
**Current identity model:** device-ID-based (pre-auth v1)

## Current state (v1)

```
Browser                            Worker                      D1
───────                            ──────                      ──
localStorage.abyss.deviceId  →   X-Abyss-Device header  →   devices.id
                                                              ↓
                                              rows scoped by device_id
```

- `deviceId` is a browser-generated UUID v4, persisted in `localStorage`.
- Every Worker request carries `X-Abyss-Device: <uuid>`.
- The Worker upserts `devices(id, created_at, last_seen_at)`.
- All durable backend tables (`runs`, `jobs`, `events`, `artifacts`,
  `usage_counters`, `stage_checkpoints`, and Learning Content Store tables)
  are scoped by `device_id`.
- `devices.user_id` is `NULL` — no auth linkage.
- D1 and R2 are accessible only through Worker bindings.

**Limitations:**
- No cross-device state (phone ↔ desktop is two separate device IDs).
- No account recovery (lose localStorage → lose generation history).
- Anyone with a device UUID can read that device's runs.
- Budgets and learning content are per-device, not per-user.
- No collaborative or shared features possible.

## Target state (post-migration)

```
Browser                            Worker                      D1
───────                            ──────                      ──
Auth session / JWT          →   Authorization: Bearer   →   user_id-scoped rows
```

- Users authenticate via the selected account provider (magic link, OAuth, or email/password).
- Browser stores an auth session through the chosen auth client.
- Worker validates JWT on every request.
- All D1 tables gain `user_id` column populated from the validated token.
- Worker-mediated D1 queries enforce `user_id` scoping.
- `deviceId` becomes a session/device identifier under a user account.

## Migration phases

### Phase 4a: Schema preparation (zero-downtime)

```sql
-- Add user_id column to all relevant tables (nullable, no FK yet)
ALTER TABLE devices ADD COLUMN user_id TEXT;
ALTER TABLE runs ADD COLUMN user_id TEXT;
ALTER TABLE jobs ADD COLUMN user_id TEXT;
ALTER TABLE events ADD COLUMN user_id TEXT;
ALTER TABLE artifacts ADD COLUMN user_id TEXT;
ALTER TABLE usage_counters ADD COLUMN user_id TEXT;
ALTER TABLE stage_checkpoints ADD COLUMN user_id TEXT;

-- Backfill: leave NULL (no existing users have accounts)

-- Add indexes for user-scoped queries
CREATE INDEX idx_runs_user_status ON runs(user_id, status, created_at DESC)
  WHERE user_id IS NOT NULL;
-- (repeat for other tables)
```

### Phase 4b: Auth UI + enrollment

1. Add the selected auth provider to the Next.js app.
2. Add sign-up / sign-in UI (auth modal or dedicated page).
3. On first sign-in, offer device-link enrollment:
   - "Link current progress to your account?"
   - If yes: backfill `user_id` on all rows for this `device_id`.
4. Continue supporting anonymous (device-ID-only) users alongside
   authenticated users.

### Phase 4c: Worker JWT validation

1. Worker middleware extracts and validates the auth JWT from
   `Authorization: Bearer` header.
2. For authenticated users:
   - Extract the stable user id from JWT.
   - Scope all queries by `user_id` instead of `device_id`.
   - Settings, budgets, and run history follow the user across devices.
3. For anonymous users (no JWT):
   - Continue using `X-Abyss-Device` header + `device_id` scope.
   - Anonymous mode remains available but may have lower budget caps.

### Phase 4d: Query scoping enforcement

1. Centralize D1 query builders behind repository methods.
2. Require authenticated repository calls to include `user_id`.
3. Add boundary tests proving route handlers cannot query user-owned tables without user/device scope.
4. Keep anonymous `device_id` scope only while the anonymous grace period remains open.

### Phase 4e: Legacy device-ID deprecation

1. After enrollment period, `deviceId`-only access is deprecated.
2. New users must create accounts.
3. Existing anonymous users see a migration prompt.
4. Full deprecation timeline: 6 months after auth launch.

## Cross-device experience (post-migration)

```
User signs in on phone → runs started on phone
User signs in on desktop → sees phone's runs (same user_id)
User starts run on phone, closes tab → desktop sees active run via SSE
User's budget is per-user, shared across devices
User's generated learning content follows the account
```

## Risk assessment

| Risk | Mitigation |
|---|---|
| Auth service downtime blocks generation | Anonymous fallback with lower caps |
| Migration data loss | Backfill is additive (NULL → UUID); no rows deleted |
| Two devices produce conflicting state | `user_id` scope naturally merges; no conflict by design |
| Query scoping blocks legitimate Worker access | Phased transition: device scope and user scope overlap until enrollment is complete |
| User loses account access | Provider-backed account recovery |

## Open decisions (Phase 4+)

1. **Auth provider(s):** Magic link vs. OAuth (Google/GitHub) vs. email/password.
   Magic link is simplest for an educational app (no password to remember).
2. **Anonymous grace period:** How long can users remain anonymous before
   requiring an account? Recommendation: 30 days of activity.
3. **Data export / deletion:** GDPR/CCPA compliance requires user data export
   and account deletion.
4. **Collaborative features:** Post-auth, the data model supports shared
   subject graphs, mentor comparisons, or classroom features.
