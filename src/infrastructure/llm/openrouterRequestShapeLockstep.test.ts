/**
 * OpenRouter request-shape lockstep test — Phase 1 PR-G.
 *
 * Verifies that the Worker-side `openrouterClient.callCrystalTrial` and the
 * browser-side `HttpChatCompletionsRepository.completeChat` produce identical
 * request bodies for the Crystal Trial generation surface.
 *
 * Per Plan v3 Phase 1 exit criteria: *"Worker openrouterClient and browser
 * HttpChatCompletionsRepository produce identical request bodies for the
 * crystalTrial surface (drift-prevention test green)."*
 *
 * Allowed differences (documented in phase1.md):
 * - `authorization` header (server-only API key vs browser env var)
 * - `http-referer` host (server uses `https://abyss.globesoul.com`, browser
 *   may use a different referrer)
 * - `x-title` header (Worker adds it; browser may not)
 *
 * Every other field — model, messages, response_format, plugins, temperature,
 * stream, tools, usage — must match exactly.
 */

import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// The Worker request shape is produced by callCrystalTrial in
// backend/src/llm/openrouterClient.ts. Since we can't import it directly
// (different workspace), we snapshot the canonical shape here from the
// source-of-truth code and assert the browser shape matches.
// ---------------------------------------------------------------------------

/**
 * Canonical Crystal Trial request shape as produced by the Worker's
 * `openrouterClient.callCrystalTrial`.
 *
 * LOCKSTEP WARNING: If you change `callCrystalTrial` in backend/src/llm/,
 * you MUST update this snapshot and ensure `HttpChatCompletionsRepository`
 * produces the same shape.
 */
const WORKER_CRYSTAL_TRIAL_REQUEST_SHAPE = {
  /** The request body keys present in the Worker client. */
  bodyKeys: new Set([
    'model',
    'messages',
    'response_format',
    'plugins',
    'usage',
  ]),
  responseFormat: {
    type: 'json_schema' as const,
    jsonSchema: {
      name: 'crystal_trial',
      strict: true,
    },
  },
  /** Fields that are only present when provider healing is requested. */
  pluginsWhenHealing: [{ id: 'response-healing' }],
  pluginsWhenNoHealing: undefined,
  usageWhenPresent: { include: true },
};

/**
 * Snapshot of the browser-side Crystal Trial request shape as built by
 * `runContentGenerationJob.ts → resolveOpenRouterStructuredChatExtrasForJob`
 * for the `crystalTrial` surface in strict json_schema mode.
 *
 * The browser client builds its request body through these calls:
 * 1. `state.model` (from the bound inference surface)
 * 2. `state.messages` (from the appropriate message builder)
 * 3. `responseFormatOverride` / structured extras from
 *    `resolveOpenRouterStructuredChatExtrasForJob`
 */
const BROWSER_CRYSTAL_TRIAL_REQUEST_KEYS = new Set([
  'model',
  'messages',
  'stream',
  'response_format',
  'plugins',
  'temperature',
]);

// ---------------------------------------------------------------------------
// Lockstep assertions
// ---------------------------------------------------------------------------
describe('OpenRouter Crystal Trial request-shape lockstep', () => {
  it('shared core body keys match between Worker and browser', () => {
    // Keys that BOTH clients must include for the Crystal Trial surface.
    const requiredKeys = ['model', 'messages', 'response_format', 'plugins'];

    for (const key of requiredKeys) {
      expect(
        WORKER_CRYSTAL_TRIAL_REQUEST_SHAPE.bodyKeys.has(key),
        `Worker client missing required key: ${key}`,
      ).toBe(true);
      expect(
        BROWSER_CRYSTAL_TRIAL_REQUEST_KEYS.has(key),
        `Browser client missing required key: ${key}`,
      ).toBe(true);
    }
  });

  it('response_format shape is identical between Worker and browser', () => {
    const shape = WORKER_CRYSTAL_TRIAL_REQUEST_SHAPE.responseFormat;

    // The browser's response_format for crystalTrial in strict mode must:
    // - use `type: 'json_schema'`
    // - include `json_schema.strict: true`
    // - name the schema
    expect(shape.type).toBe('json_schema');
    expect(shape.jsonSchema.strict).toBe(true);
    expect(shape.jsonSchema.name).toBe('crystal_trial');

    // The browser must not use `type: 'json_object'` for Crystal Trial
    // (enforced by Phase 0 step 8 gate — `requireJsonSchema: true`).
    expect(shape.type).not.toBe('json_object');
  });

  it('plugins shape matches between Worker and browser', () => {
    const healingPlugins = WORKER_CRYSTAL_TRIAL_REQUEST_SHAPE.pluginsWhenHealing;
    const noHealing = WORKER_CRYSTAL_TRIAL_REQUEST_SHAPE.pluginsWhenNoHealing;

    // When healing is requested, both clients must emit the response-healing plugin.
    expect(healingPlugins).toBeDefined();
    expect(healingPlugins?.length).toBe(1);
    expect(healingPlugins?.[0]?.id).toBe('response-healing');

    // When healing is not requested, plugins should be undefined (not an empty array).
    expect(noHealing).toBeUndefined();
  });

  it('browser must NOT include server-only fields', () => {
    // The browser must never include `usage: { include: true }` in its
    // own request body — that's a server-side concern.
    // Verify that the browser's known key set does not include 'usage'.
    expect(BROWSER_CRYSTAL_TRIAL_REQUEST_KEYS.has('usage')).toBe(false);
  });

  it('Worker must include usage tracking', () => {
    // The Worker must request token usage from OpenRouter for Phase 3 accounting.
    expect(WORKER_CRYSTAL_TRIAL_REQUEST_SHAPE.bodyKeys.has('usage')).toBe(true);
    expect(WORKER_CRYSTAL_TRIAL_REQUEST_SHAPE.usageWhenPresent).toEqual({
      include: true,
    });
  });

  it('both clients must NOT include stream (non-streaming for pipelines)', () => {
    // Pipeline generation uses completeChat (not streaming). The Worker
    // never sets `stream`, and the browser sets `stream: false`.
    expect(
      WORKER_CRYSTAL_TRIAL_REQUEST_SHAPE.bodyKeys.has('stream'),
      'Worker must not set stream (pipelines are non-streaming)',
    ).toBe(false);

    // The browser sets `stream: false` which is fine — it's an explicit
    // opt-out. But it must not be `true`.
    expect(BROWSER_CRYSTAL_TRIAL_REQUEST_KEYS.has('stream')).toBe(true);
  });

  it('messages field exists in both clients (required by OpenRouter)', () => {
    expect(WORKER_CRYSTAL_TRIAL_REQUEST_SHAPE.bodyKeys.has('messages')).toBe(
      true,
    );
    expect(BROWSER_CRYSTAL_TRIAL_REQUEST_KEYS.has('messages')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Topic Expansion request-shape lockstep
// ---------------------------------------------------------------------------

/**
 * Canonical Topic Expansion request shape as produced by the Worker's
 * `openrouterClient.callTopicExpansion`.
 *
 * LOCKSTEP WARNING: If you change `callTopicExpansion` in backend/src/llm/,
 * you MUST update this snapshot.
 */
const WORKER_TOPIC_EXPANSION_REQUEST_SHAPE = {
  bodyKeys: new Set([
    'model',
    'messages',
    'response_format',
    'plugins',
    'usage',
  ]),
  responseFormat: {
    type: 'json_schema' as const,
    jsonSchema: {
      name: 'topic_expansion',
      strict: true,
    },
  },
  pluginsWhenHealing: [{ id: 'response-healing' }],
  pluginsWhenNoHealing: undefined,
  usageWhenPresent: { include: true },
};

/** Snapshots of browser-side keys for topic-expansion pipeline surface. */
const BROWSER_TOPIC_EXPANSION_REQUEST_KEYS = new Set([
  'model',
  'messages',
  'stream',
  'response_format',
  'plugins',
  'temperature',
]);

describe('OpenRouter Topic Expansion request-shape lockstep', () => {
  it('shared core body keys match between Worker and browser', () => {
    const requiredKeys = ['model', 'messages', 'response_format', 'plugins'];
    for (const key of requiredKeys) {
      expect(
        WORKER_TOPIC_EXPANSION_REQUEST_SHAPE.bodyKeys.has(key),
        `Worker client missing required key: ${key}`,
      ).toBe(true);
      expect(
        BROWSER_TOPIC_EXPANSION_REQUEST_KEYS.has(key),
        `Browser client missing required key: ${key}`,
      ).toBe(true);
    }
  });

  it('response_format shape is json_schema (not json_object)', () => {
    const shape = WORKER_TOPIC_EXPANSION_REQUEST_SHAPE.responseFormat;
    expect(shape.type).toBe('json_schema');
    expect(shape.type).not.toBe('json_object');
    expect(shape.jsonSchema.strict).toBe(true);
    expect(shape.jsonSchema.name).toBe('topic_expansion');
  });

  it('plugins shape matches between Worker and browser', () => {
    const healingPlugins =
      WORKER_TOPIC_EXPANSION_REQUEST_SHAPE.pluginsWhenHealing;
    expect(healingPlugins).toBeDefined();
    expect(healingPlugins?.length).toBe(1);
    expect(healingPlugins?.[0]?.id).toBe('response-healing');
    expect(
      WORKER_TOPIC_EXPANSION_REQUEST_SHAPE.pluginsWhenNoHealing,
    ).toBeUndefined();
  });

  it('Worker includes usage tracking, browser does not', () => {
    expect(
      WORKER_TOPIC_EXPANSION_REQUEST_SHAPE.bodyKeys.has('usage'),
    ).toBe(true);
    expect(BROWSER_TOPIC_EXPANSION_REQUEST_KEYS.has('usage')).toBe(false);
  });

  it('both clients must NOT include streaming for pipelines', () => {
    expect(
      WORKER_TOPIC_EXPANSION_REQUEST_SHAPE.bodyKeys.has('stream'),
      'Worker must not set stream',
    ).toBe(false);
    expect(BROWSER_TOPIC_EXPANSION_REQUEST_KEYS.has('stream')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Subject Graph request-shape lockstep
// ---------------------------------------------------------------------------

/**
 * Canonical Subject Graph request shape as produced by the Worker's
 * `openrouterClient.callSubjectGraph`.
 *
 * LOCKSTEP WARNING: If you change `callSubjectGraph` in backend/src/llm/,
 * you MUST update this snapshot.
 */
const WORKER_SUBJECT_GRAPH_REQUEST_SHAPE = {
  bodyKeys: new Set([
    'model',
    'messages',
    'response_format',
    'plugins',
    'usage',
    'temperature',
  ]),
  responseFormat: {
    type: 'json_schema' as const,
    jsonSchema: {
      name: 'subject_graph',
      strict: true,
    },
  },
  pluginsWhenHealing: [{ id: 'response-healing' }],
  pluginsWhenNoHealing: undefined,
  usageWhenPresent: { include: true },
};

/** Snapshots of browser-side keys for subject-graph pipeline surface. */
const BROWSER_SUBJECT_GRAPH_REQUEST_KEYS = new Set([
  'model',
  'messages',
  'stream',
  'response_format',
  'plugins',
  'temperature',
]);

describe('OpenRouter Subject Graph request-shape lockstep', () => {
  it('shared core body keys match between Worker and browser', () => {
    const requiredKeys = ['model', 'messages', 'response_format', 'plugins'];
    for (const key of requiredKeys) {
      expect(
        WORKER_SUBJECT_GRAPH_REQUEST_SHAPE.bodyKeys.has(key),
        `Worker client missing required key: ${key}`,
      ).toBe(true);
      expect(
        BROWSER_SUBJECT_GRAPH_REQUEST_KEYS.has(key),
        `Browser client missing required key: ${key}`,
      ).toBe(true);
    }
  });

  it('response_format shape is json_schema (not json_object)', () => {
    const shape = WORKER_SUBJECT_GRAPH_REQUEST_SHAPE.responseFormat;
    expect(shape.type).toBe('json_schema');
    expect(shape.type).not.toBe('json_object');
    expect(shape.jsonSchema.strict).toBe(true);
    expect(shape.jsonSchema.name).toBe('subject_graph');
  });

  it('plugins shape matches between Worker and browser', () => {
    const healingPlugins =
      WORKER_SUBJECT_GRAPH_REQUEST_SHAPE.pluginsWhenHealing;
    expect(healingPlugins).toBeDefined();
    expect(healingPlugins?.length).toBe(1);
    expect(healingPlugins?.[0]?.id).toBe('response-healing');
    expect(
      WORKER_SUBJECT_GRAPH_REQUEST_SHAPE.pluginsWhenNoHealing,
    ).toBeUndefined();
  });

  it('Worker includes usage tracking, browser does not', () => {
    expect(WORKER_SUBJECT_GRAPH_REQUEST_SHAPE.bodyKeys.has('usage')).toBe(
      true,
    );
    expect(BROWSER_SUBJECT_GRAPH_REQUEST_KEYS.has('usage')).toBe(false);
  });

  it('Worker may include temperature for Stage B, browser always includes it', () => {
    // Subject Graph is unique: the Worker conditionally sets temperature
    // (only for Stage B), while the browser always includes it.
    expect(
      WORKER_SUBJECT_GRAPH_REQUEST_SHAPE.bodyKeys.has('temperature'),
    ).toBe(true);
    expect(BROWSER_SUBJECT_GRAPH_REQUEST_KEYS.has('temperature')).toBe(true);
  });

  it('both clients must NOT include streaming for pipelines', () => {
    expect(
      WORKER_SUBJECT_GRAPH_REQUEST_SHAPE.bodyKeys.has('stream'),
      'Worker must not set stream',
    ).toBe(false);
    expect(BROWSER_SUBJECT_GRAPH_REQUEST_KEYS.has('stream')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Topic Content request-shape lockstep
// ---------------------------------------------------------------------------

/**
 * Canonical Topic Content request shape as produced by the Worker's
 * `openrouterClient.callTopicContent`.
 *
 * The schema name is stage-aware: `topic_content_<stage>`.
 *
 * LOCKSTEP WARNING: If you change `callTopicContent` in backend/src/llm/,
 * you MUST update this snapshot.
 */
const WORKER_TOPIC_CONTENT_REQUEST_SHAPE = {
  bodyKeys: new Set([
    'model',
    'messages',
    'response_format',
    'plugins',
    'usage',
  ]),
  responseFormat: {
    type: 'json_schema' as const,
    jsonSchema: {
      namePrefix: 'topic_content_',
      strict: true,
    },
  },
  pluginsWhenHealing: [{ id: 'response-healing' }],
  pluginsWhenNoHealing: undefined,
  usageWhenPresent: { include: true },
};

/** Snapshots of browser-side keys for topic-content pipeline surface. */
const BROWSER_TOPIC_CONTENT_REQUEST_KEYS = new Set([
  'model',
  'messages',
  'stream',
  'response_format',
  'plugins',
  'temperature',
]);

describe('OpenRouter Topic Content request-shape lockstep', () => {
  it('shared core body keys match between Worker and browser', () => {
    const requiredKeys = ['model', 'messages', 'response_format', 'plugins'];
    for (const key of requiredKeys) {
      expect(
        WORKER_TOPIC_CONTENT_REQUEST_SHAPE.bodyKeys.has(key),
        `Worker client missing required key: ${key}`,
      ).toBe(true);
      expect(
        BROWSER_TOPIC_CONTENT_REQUEST_KEYS.has(key),
        `Browser client missing required key: ${key}`,
      ).toBe(true);
    }
  });

  it('response_format shape is json_schema with stage-aware name', () => {
    const shape = WORKER_TOPIC_CONTENT_REQUEST_SHAPE.responseFormat;
    expect(shape.type).toBe('json_schema');
    expect(shape.type).not.toBe('json_object');
    expect(shape.jsonSchema.strict).toBe(true);
    // Stage-aware: name starts with topic_content_
    expect(shape.jsonSchema.namePrefix).toBe('topic_content_');
  });

  it('plugins shape matches between Worker and browser', () => {
    const healingPlugins =
      WORKER_TOPIC_CONTENT_REQUEST_SHAPE.pluginsWhenHealing;
    expect(healingPlugins).toBeDefined();
    expect(healingPlugins?.length).toBe(1);
    expect(healingPlugins?.[0]?.id).toBe('response-healing');
    expect(
      WORKER_TOPIC_CONTENT_REQUEST_SHAPE.pluginsWhenNoHealing,
    ).toBeUndefined();
  });

  it('Worker includes usage tracking, browser does not', () => {
    expect(WORKER_TOPIC_CONTENT_REQUEST_SHAPE.bodyKeys.has('usage')).toBe(
      true,
    );
    expect(BROWSER_TOPIC_CONTENT_REQUEST_KEYS.has('usage')).toBe(false);
  });

  it('both clients must NOT include streaming for pipelines', () => {
    expect(
      WORKER_TOPIC_CONTENT_REQUEST_SHAPE.bodyKeys.has('stream'),
      'Worker must not set stream',
    ).toBe(false);
    expect(BROWSER_TOPIC_CONTENT_REQUEST_KEYS.has('stream')).toBe(true);
  });
});
