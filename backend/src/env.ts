/**
 * Environment bindings for the durable orchestrator Worker.
 *
 * Secrets (set via `wrangler secret put`) and non-secret `[vars]` from
 * `wrangler.toml` are both available on `env` in Hono route handlers
 * (`c.env`).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Workflow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DurableObjectNamespace = any;

export interface Env {
  // ---- secrets ----
  /** Supabase project URL (https://<ref>.supabase.co). */
  SUPABASE_URL: string;
  /** Supabase service-role key — NEVER exposed to the browser. */
  SUPABASE_SERVICE_ROLE: string;
  /** OpenRouter API key for server-side LLM calls. */
  OPENROUTER_API_KEY: string;

  // ---- storage bindings ----
  /** Cloudflare R2 bucket for durable generation artifact JSON envelopes. */
  GENERATION_ARTIFACTS_BUCKET?: R2Bucket;

  // ---- non-secret vars ----
  /** Comma-separated CORS allowlist (from wrangler.toml `[vars]`). */
  ALLOWED_ORIGINS: string;
  /** OpenRouter referrer URL for attribution headers. */
  OPENROUTER_REFERRER?: string;

  // ---- workflow bindings (Phase 2: all four pipeline kinds) ----
  CRYSTAL_TRIAL_WORKFLOW: Workflow;
  TOPIC_EXPANSION_WORKFLOW: Workflow;
  SUBJECT_GRAPH_WORKFLOW: Workflow;
  TOPIC_CONTENT_WORKFLOW: Workflow;

  // ---- durable object bindings ----
  // RUN_EVENT_BUS: DurableObjectNamespace;
}
