# Supabase Auth Migration Plan

**Last updated:** 2026-05-06
**Status:** Phase 4 — planning (implementation deferred to Phase 4+)
**Current identity model:** device-ID-based (pre-auth v1)

## Current state (v1)

```
Browser                            Worker                      Supabase
───────                            ──────                      ────────
localStorage.abyss.deviceId  →   X-Abyss-Device header  →   devices.id (UUID)
                                                              ↓
                                              ALL rows scoped by device_id
```

- `deviceId` is a browser-generated UUID v4, persisted in `localStorage`.
- Every Worker request carries `X-Abyss-Device: <uuid>`.
- The Worker upserts `devices(id, created_at, last_seen_at)`.
- All tables (`runs`, `jobs`, `events`, `artifacts`, `usage_counters`,
  `device_settings`) are scoped by `device_id`.
- `devices.user_id` is `NULL` — no auth linkage.
- Supabase RLS is not used — the Worker uses service-role credentials.

**Limitations:**
- No cross-device state (phone ↔ desktop is two separate device IDs).
- No account recovery (lose localStorage → lose generation history).
- Anyone with a device UUID can read that device's runs.
- Budgets and settings are per-device, not per-user.
- No collaborative or shared features possible.

## Target state (post-migration)

```
Browser                            Worker                      Supabase
───────                            ──────                      ────────
Supabase Auth session       →   Authorization: Bearer   →   auth.users (id)
                                                              ↓
                                              RLS: auth.uid() = user_id
```

- Users authenticate via Supabase Auth (magic link, OAuth, or email/password).
- Browser stores Supabase Auth session (managed by `@supabase/ssr`).
- Worker validates JWT on every request.
- All tables gain `user_id` column (populated from `auth.uid()`).
- RLS policies enforce `user_id = auth.uid()`.
- `deviceId` becomes a session/device identifier under a user account.

## Migration phases

### Phase 4a: Schema preparation (zero-downtime)

```sql
-- Add user_id column to all relevant tables (nullable, no FK yet)
ALTER TABLE devices ADD COLUMN auth_user_id UUID;
ALTER TABLE runs ADD COLUMN auth_user_id UUID;
ALTER TABLE jobs ADD COLUMN auth_user_id UUID;
ALTER TABLE events ADD COLUMN auth_user_id UUID;
ALTER TABLE artifacts ADD COLUMN auth_user_id UUID;
ALTER TABLE usage_counters ADD COLUMN auth_user_id UUID;
ALTER TABLE device_settings ADD COLUMN auth_user_id UUID;
ALTER TABLE stage_checkpoints ADD COLUMN auth_user_id UUID;

-- Backfill: leave NULL (no existing users have accounts)

-- Add indexes for user-scoped queries
CREATE INDEX idx_runs_user_status ON runs(auth_user_id, status, created_at DESC)
  WHERE auth_user_id IS NOT NULL;
-- (repeat for other tables)
```

### Phase 4b: Auth UI + enrollment

1. Add Supabase Auth to the Next.js app (`@supabase/ssr`).
2. Add sign-up / sign-in UI (auth modal or dedicated page).
3. On first sign-in, offer device-link enrollment:
   - "Link current progress to your account?"
   - If yes: backfill `auth_user_id` on all rows for this `device_id`.
4. Continue supporting anonymous (device-ID-only) users alongside
   authenticated users.

### Phase 4c: Worker JWT validation

1. Worker middleware extracts and validates Supabase Auth JWT from
   `Authorization: Bearer` header.
2. For authenticated users:
   - Extract `auth.uid()` from JWT.
   - Scope all queries by `auth_user_id` instead of `device_id`.
   - Settings, budgets, and run history follow the user across devices.
3. For anonymous users (no JWT):
   - Continue using `X-Abyss-Device` header + `device_id` scope.
   - Anonymous mode remains available but may have lower budget caps.

### Phase 4d: RLS enforcement

1. Enable RLS on all tables.
2. Create policies:

```sql
-- Example: runs table
CREATE POLICY "Users can read own runs"
  ON runs FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Users can insert own runs"
  ON runs FOR INSERT
  WITH CHECK (auth_user_id = auth.uid());

-- Service role bypass for Worker (used in migration transition)
CREATE POLICY "Service role full access"
  ON runs
  USING (true)
  WITH CHECK (true)
  TO service_role;
```

3. Worker transitions from service-role to authenticated role for
   user-scoped queries (using the user's JWT).

### Phase 4e: Legacy device-ID deprecation

1. After enrollment period, `deviceId`-only access is deprecated.
2. New users must create accounts.
3. Existing anonymous users see a migration prompt.
4. Full deprecation timeline: 6 months after auth launch.

## Cross-device experience (post-migration)

```
User signs in on phone → runs started on phone
User signs in on desktop → sees phone's runs (same auth_user_id)
User starts run on phone, closes tab → desktop sees active run via SSE
User's budget is per-user, shared across devices
User's settings follow the account
```

## Risk assessment

| Risk | Mitigation |
|---|---|
| Auth service downtime blocks generation | Anonymous fallback with lower caps |
| Migration data loss | Backfill is additive (NULL → UUID); no rows deleted |
| Two devices produce conflicting state | `user_id` scope naturally merges; no conflict by design |
| RLS blocks legitimate Worker access | Phased transition: service-role → authenticated role with overlap |
| User loses account access | Account recovery via Supabase Auth (email-based) |

## Open decisions (Phase 4+)

1. **Auth provider(s):** Magic link vs. OAuth (Google/GitHub) vs. email/password.
   Magic link is simplest for an educational app (no password to remember).
2. **Anonymous grace period:** How long can users remain anonymous before
   requiring an account? Recommendation: 30 days of activity.
3. **Data export / deletion:** GDPR/CCPA compliance requires user data export
   and account deletion. Supabase Auth provides these primitives.
4. **Collaborative features:** Post-auth, the data model supports shared
   subject graphs, mentor comparisons, or classroom features.
