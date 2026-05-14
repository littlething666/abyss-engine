/** Environment bindings for the durable orchestrator Worker. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Workflow = any;
export interface Env {
  // ---- secrets ----
  /** API key for the configured OpenAI-compatible LLM gateway. */
  LLM_API_KEY: string;

  // ---- storage bindings ----
  /** Cloudflare D1 database for queryable durable run/content state. */
  GENERATION_DB: D1Database;
  /** Cloudflare R2 bucket for durable generation artifact JSON envelopes. */
  GENERATION_ARTIFACTS_BUCKET?: R2Bucket;

  // ---- non-secret vars ----
  /** Comma-separated CORS allowlist (from wrangler.toml `[vars]`). */
  ALLOWED_ORIGINS: string;
  /** OpenAI-compatible gateway base URL, without trailing `/chat/completions`. */
  LLM_BASE_URL?: string;
  /** Gateway/provider flavor for provider-specific compatibility features. */
  LLM_PROVIDER?: 'openrouter' | 'openai-compatible';
  /** Optional referrer URL for providers that support attribution headers. */
  LLM_REFERRER?: string;
  /** Optional app title for providers that support attribution headers. */
  LLM_TITLE?: string;

  // ---- workflow bindings ----
  CRYSTAL_TRIAL_WORKFLOW: Workflow;
  TOPIC_EXPANSION_WORKFLOW: Workflow;
  SUBJECT_GRAPH_WORKFLOW: Workflow;
  TOPIC_CONTENT_WORKFLOW: Workflow;
}
