/** Environment bindings for the durable orchestrator Worker. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Workflow = any;
export interface Env {
  // ---- secrets ----
  /** OpenRouter API key for server-side LLM calls. */
  OPENROUTER_API_KEY: string;

  // ---- storage bindings ----
  /** Cloudflare D1 database for queryable durable run/content state. */
  GENERATION_DB: D1Database;
  /** Cloudflare R2 bucket for durable generation artifact JSON envelopes. */
  GENERATION_ARTIFACTS_BUCKET?: R2Bucket;

  // ---- non-secret vars ----
  /** Comma-separated CORS allowlist (from wrangler.toml `[vars]`). */
  ALLOWED_ORIGINS: string;
  /** OpenRouter referrer URL for attribution headers. */
  OPENROUTER_REFERRER?: string;

  // ---- workflow bindings ----
  CRYSTAL_TRIAL_WORKFLOW: Workflow;
  TOPIC_EXPANSION_WORKFLOW: Workflow;
  SUBJECT_GRAPH_WORKFLOW: Workflow;
  TOPIC_CONTENT_WORKFLOW: Workflow;
}
