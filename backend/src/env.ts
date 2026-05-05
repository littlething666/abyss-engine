/**
 * Environment bindings for the durable orchestrator Worker.
 *
 * Secrets (set via `wrangler secret put`) and non-secret `[vars]` from
 * `wrangler.toml` are both available on `env` in Hono route handlers
 * (`c.env`).
 */

export interface Env {
  // ---- secrets ----
  /** Supabase project URL (https://<ref>.supabase.co). */
  SUPABASE_URL: string;
  /** Supabase service-role key — NEVER exposed to the browser. */
  SUPABASE_SERVICE_ROLE: string;
  /** OpenRouter API key for server-side LLM calls. */
  OPENROUTER_API_KEY: string;

  // ---- non-secret vars ----
  /** Comma-separated CORS allowlist (from wrangler.toml `[vars]`). */
  ALLOWED_ORIGINS: string;
  /** OpenRouter referrer URL for attribution headers. */
  OPENROUTER_REFERRER?: string;

  // ---- bindings (commented out until Workflow / DO classes land) ----
  // CRYSTAL_TRIAL_WORKFLOW: Workflow<{ runId: string; deviceId: string }>;
  // RUN_EVENT_BUS: DurableObjectNamespace;
}
