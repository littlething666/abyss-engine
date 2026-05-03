import { extractJsonString, logJsonParseError } from '@/lib/llmResponseText';
import { interpolatePromptTemplate } from '@/lib/interpolatePromptTemplate';
import subjectGraphEdgesPrompt from '@/prompts/subject-graph-edges.prompt';
import type { GraphPrerequisiteEntry } from '@/types/core';
import type { GraphStrategy } from '@/types/generationStrategy';
import type { ChatMessage } from '@/types/llm';
import type { TopicLattice } from '@/types/topicLattice';

/**
 * Single-seam Stage-B prerequisite-edge module.
 *
 * Exposed exclusively through `createPrerequisiteEdgeRules(lattice)` so that
 * prompt construction, deterministic repair, and strict validation cannot
 * grow into independent surfaces. `acceptModelResponse` performs exactly:
 *   1. one JSON extraction
 *   2. one JSON parse
 *   3. one deterministic repair pass (the documented Stage-B exception in
 *      AGENTS.md → "Curriculum prerequisite edges")
 *   4. one strict validation pass
 * Anything outside that pipeline must fail explicitly with a typed reason
 * — no second parse, no fallback, no retry.
 */
export type PrereqEdges = Record<string, GraphPrerequisiteEntry[]>;

export type PrereqEdgesCorrectionLog = {
  removed: Array<{ topicId: string; prereqId: string; reason: string }>;
  added: Array<{ topicId: string; prereqId: string; kind: 'filler-tier1' | 'filler-tier2' }>;
};

export type PrereqEdgesCorrectionObservation = {
  metadata: { prereqEdgesCorrection: PrereqEdgesCorrectionLog };
  eventFields: {
    prereqEdgesCorrectionApplied: true;
    prereqEdgesCorrectionRemovedCount: number;
    prereqEdgesCorrectionAddedCount: number;
    prereqEdgesCorrection: PrereqEdgesCorrectionLog;
  };
  consoleEvent: {
    label: '[subjectGraph] prereqEdgesCorrection';
    removedCount: number;
    addedCount: number;
    removed: PrereqEdgesCorrectionLog['removed'];
    added: PrereqEdgesCorrectionLog['added'];
  };
};

export type PrerequisiteEdgeAcceptance =
  | {
      ok: true;
      edges: PrereqEdges;
      correction: PrereqEdgesCorrectionLog;
      observation: PrereqEdgesCorrectionObservation | null;
    }
  | {
      ok: false;
      error: string;
      reason:
        | 'missing-json'
        | 'invalid-json'
        | 'missing-edges-object'
        | 'strict-validation-failed';
    };

export interface PrerequisiteEdgeRules {
  buildMessages(input: {
    subjectId: string;
    subjectTitle: string;
    strategy: GraphStrategy;
  }): ChatMessage[];
  acceptModelResponse(rawAssistantText: string): PrerequisiteEdgeAcceptance;
}

type PrerequisiteLatticeContract = {
  tierById: Map<string, number>;
  tier1: Set<string>;
  tier2: Set<string>;
  tier3: Set<string>;
  tier1Ordered: string[];
  tier2Ordered: string[];
  requiredEdgeKeys: Set<string>;
  topicIdsByTier: Map<number, string[]>;
};

function buildContract(lattice: TopicLattice): PrerequisiteLatticeContract {
  const tierById = new Map<string, number>();
  const tier1 = new Set<string>();
  const tier2 = new Set<string>();
  const tier3 = new Set<string>();
  const tier1Ordered: string[] = [];
  const tier2Ordered: string[] = [];
  const topicIdsByTier = new Map<number, string[]>();

  for (const t of lattice.topics) {
    tierById.set(t.topicId, t.tier);
    const bucket = topicIdsByTier.get(t.tier) ?? [];
    bucket.push(t.topicId);
    topicIdsByTier.set(t.tier, bucket);
    if (t.tier === 1) {
      tier1.add(t.topicId);
      tier1Ordered.push(t.topicId);
    } else if (t.tier === 2) {
      tier2.add(t.topicId);
      tier2Ordered.push(t.topicId);
    } else if (t.tier === 3) {
      tier3.add(t.topicId);
    }
  }

  const requiredEdgeKeys = new Set<string>([...tier2, ...tier3]);

  return {
    tierById,
    tier1,
    tier2,
    tier3,
    tier1Ordered,
    tier2Ordered,
    requiredEdgeKeys,
    topicIdsByTier,
  };
}

function formatIdList(title: string, ids: string[]): string {
  if (ids.length === 0) return `${title}\n  (none)`;
  return `${title}\n${ids.map((id) => `    - ${id}`).join('\n')}`;
}

function prereqTopicId(entry: GraphPrerequisiteEntry): string {
  return typeof entry === 'string' ? entry : entry.topicId;
}

function normalizeEntry(raw: unknown): GraphPrerequisiteEntry | null {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (typeof raw === 'object' && raw !== null && 'topicId' in raw) {
    const topicId = (raw as { topicId: unknown }).topicId;
    if (typeof topicId !== 'string' || !topicId.trim()) return null;
    const tid = topicId.trim();
    const ml = (raw as { minLevel?: unknown }).minLevel;
    if (typeof ml === 'number' && Number.isInteger(ml) && ml >= 1) {
      return { topicId: tid, minLevel: ml };
    }
    return tid;
  }
  return null;
}

function dedupePreservingOrder(entries: GraphPrerequisiteEntry[]): GraphPrerequisiteEntry[] {
  const seen = new Set<string>();
  const out: GraphPrerequisiteEntry[] = [];
  for (const e of entries) {
    const id = prereqTopicId(e);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out;
}

function repairEdges(
  contract: PrerequisiteLatticeContract,
  rawEdges: Record<string, unknown>,
): { edges: PrereqEdges; correction: PrereqEdgesCorrectionLog } {
  const removed: PrereqEdgesCorrectionLog['removed'] = [];
  const added: PrereqEdgesCorrectionLog['added'] = [];
  const edges: PrereqEdges = {};

  const firstTier1 = contract.tier1Ordered[0];
  const firstTier2 = contract.tier2Ordered[0];

  for (const topicId of contract.requiredEdgeKeys) {
    const tier = contract.tierById.get(topicId);
    if (tier === undefined) continue;

    const rawVal = rawEdges[topicId];
    const rawArr = Array.isArray(rawVal) ? rawVal : [];

    let entries: GraphPrerequisiteEntry[] = [];
    for (const item of rawArr) {
      const norm = normalizeEntry(item);
      if (!norm) {
        removed.push({
          topicId,
          prereqId: typeof item === 'string' ? item : JSON.stringify(item),
          reason: 'unrecognized prerequisite entry shape',
        });
        continue;
      }
      entries.push(norm);
    }

    entries = dedupePreservingOrder(entries);

    if (tier === 2) {
      const filtered: GraphPrerequisiteEntry[] = [];
      for (const e of entries) {
        const pid = prereqTopicId(e);
        if (!contract.tier1.has(pid)) {
          removed.push({
            topicId,
            prereqId: pid,
            reason: contract.tierById.has(pid)
              ? `tier-2 topic may only list tier-1 prerequisites (got tier ${contract.tierById.get(pid)})`
              : 'unknown topic id',
          });
          continue;
        }
        filtered.push(e);
      }
      entries = filtered;

      if (entries.length === 0 && firstTier1) {
        entries.push(firstTier1);
        added.push({ topicId, prereqId: firstTier1, kind: 'filler-tier1' });
      }
    }

    if (tier === 3) {
      const filtered: GraphPrerequisiteEntry[] = [];
      for (const e of entries) {
        const pid = prereqTopicId(e);
        const pt = contract.tierById.get(pid);
        if (pt === undefined) {
          removed.push({ topicId, prereqId: pid, reason: 'unknown topic id' });
          continue;
        }
        if (pt >= tier) {
          removed.push({
            topicId,
            prereqId: pid,
            reason: `prerequisite tier ${pt} must be lower than dependent tier ${tier}`,
          });
          continue;
        }
        if (contract.tier3.has(pid)) {
          removed.push({
            topicId,
            prereqId: pid,
            reason: 'tier-3 topics must not appear as prerequisites',
          });
          continue;
        }
        filtered.push(e);
      }
      entries = dedupePreservingOrder(filtered);

      const hasTier2 = entries.some((e) => contract.tier2.has(prereqTopicId(e)));
      if (!hasTier2 && firstTier2) {
        entries.push(firstTier2);
        added.push({ topicId, prereqId: firstTier2, kind: 'filler-tier2' });
      }

      entries = dedupePreservingOrder(entries);
    }

    edges[topicId] = entries;
  }

  return { edges, correction: { removed, added } };
}

function strictValidate(
  contract: PrerequisiteLatticeContract,
  edges: PrereqEdges,
): { ok: true } | { ok: false; error: string } {
  const keys = Object.keys(edges);
  const keySet = new Set(keys);

  for (const id of contract.tier1) {
    if (keySet.has(id)) {
      return { ok: false, error: `Tier 1 topic "${id}" must not appear as a key in edges` };
    }
  }

  for (const k of contract.requiredEdgeKeys) {
    if (!keySet.has(k)) {
      return { ok: false, error: `Missing edges entry for required topic "${k}"` };
    }
  }

  for (const k of keys) {
    if (!contract.requiredEdgeKeys.has(k)) {
      return {
        ok: false,
        error: `Unexpected edges key "${k}" (only tier 2 and tier 3 topic ids are allowed)`,
      };
    }
  }

  for (const topicId of keys) {
    const tier = contract.tierById.get(topicId);
    if (tier === undefined) continue;

    const prereqs = edges[topicId] ?? [];

    if (tier === 2) {
      for (const entry of prereqs) {
        const pid = prereqTopicId(entry);
        if (!contract.tier1.has(pid)) {
          return {
            ok: false,
            error: `Tier 2 topic "${topicId}" may only reference tier-1 prerequisites; got "${pid}"`,
          };
        }
      }
    }

    if (tier === 3) {
      if (prereqs.length === 0) {
        return {
          ok: false,
          error: `Tier 3 topic "${topicId}" must list at least one prerequisite`,
        };
      }
      let hasTier2 = false;
      for (const entry of prereqs) {
        const pid = prereqTopicId(entry);
        const pt = contract.tierById.get(pid);
        if (pt === undefined) {
          return { ok: false, error: `Unknown prerequisite "${pid}" for topic "${topicId}"` };
        }
        if (pt >= tier) {
          return {
            ok: false,
            error: `Prerequisite "${pid}" (tier ${pt}) must be from a lower tier than "${topicId}" (tier ${tier})`,
          };
        }
        if (contract.tier3.has(pid)) {
          return {
            ok: false,
            error: `Tier 3 topic "${topicId}" must not list another tier-3 topic "${pid}" as a prerequisite`,
          };
        }
        if (pt === 2) hasTier2 = true;
      }
      if (!hasTier2) {
        return {
          ok: false,
          error: `Tier 3 topic "${topicId}" must include at least one prerequisite from tier 2`,
        };
      }
    }
  }

  return { ok: true };
}

function buildMessagesFromContract(
  contract: PrerequisiteLatticeContract,
  input: { subjectId: string; subjectTitle: string; strategy: GraphStrategy },
): ChatMessage[] {
  const tier3Ordered = contract.topicIdsByTier.get(3) ?? [];

  const tier3Pair =
    tier3Ordered.length >= 2
      ? `CONCRETE NEGATIVE EXAMPLE FOR THIS LATTICE:
  DO NOT list "${tier3Ordered[0]}" as a prerequisite of "${tier3Ordered[1]}".
  Both are tier 3; same-tier prerequisite edges are forbidden.`
      : `CONCRETE NEGATIVE EXAMPLE: do not connect two tier-3 topics as prerequisite and dependent—same tier is forbidden.`;

  const latticeBlock = [
    'Lattice (authoritative):',
    formatIdList('  Tier 1 ids (permitted as prerequisites for tier 2 only):', contract.tier1Ordered),
    formatIdList('  Tier 2 ids (keys in edges; prerequisites for tier 2 may only be tier 1):', contract.tier2Ordered),
    formatIdList('  Tier 3 ids (keys in edges; prerequisites may be tier 1 and tier 2, never tier 3):', tier3Ordered),
    '',
    'Required output shape:',
    '  { "edges": { "<topicId>": [ "<prereqId>" | { "topicId":"<prereqId>", "minLevel": int } ], ... } }',
    '',
    'Rules:',
    '  - The `edges` map MUST contain every tier 2 id and every tier 3 id as keys.',
    '  - Tier 1 ids MUST NOT appear as keys.',
    '  - Values for a tier 2 key may reference only tier 1 ids.',
    '  - Values for a tier 3 key must reference at least one tier 2 id; may also reference tier 1 ids.',
    '  - NEVER include a tier 3 id in any value array.',
    '',
    tier3Pair,
  ].join('\n');

  const systemIntro = interpolatePromptTemplate(subjectGraphEdgesPrompt, {
    subjectId: input.subjectId,
    subjectTitle: input.subjectTitle,
    audience: input.strategy.audienceBrief,
    domainDescription: input.strategy.domainBrief,
  });

  const systemContent = `${systemIntro}\n\n${latticeBlock}`;

  const userContent = input.strategy.focusConstraints.trim()
    ? `Additional constraints from the learner:\n${input.strategy.focusConstraints}\n\nOutput only the JSON edges object as specified.`
    : 'Output only the JSON edges object as specified.';

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

function buildObservation(
  correction: PrereqEdgesCorrectionLog,
): PrereqEdgesCorrectionObservation | null {
  if (correction.removed.length + correction.added.length === 0) return null;
  return {
    metadata: { prereqEdgesCorrection: correction },
    eventFields: {
      prereqEdgesCorrectionApplied: true,
      prereqEdgesCorrectionRemovedCount: correction.removed.length,
      prereqEdgesCorrectionAddedCount: correction.added.length,
      prereqEdgesCorrection: correction,
    },
    consoleEvent: {
      label: '[subjectGraph] prereqEdgesCorrection',
      removedCount: correction.removed.length,
      addedCount: correction.added.length,
      removed: correction.removed,
      added: correction.added,
    },
  };
}

export function createPrerequisiteEdgeRules(lattice: TopicLattice): PrerequisiteEdgeRules {
  const contract = buildContract(lattice);

  return {
    buildMessages(input) {
      return buildMessagesFromContract(contract, input);
    },
    acceptModelResponse(rawAssistantText) {
      const jsonStr = extractJsonString(rawAssistantText);
      if (!jsonStr) {
        return {
          ok: false,
          error: 'No JSON found in assistant response',
          reason: 'missing-json',
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr) as unknown;
      } catch (e) {
        logJsonParseError('prerequisiteEdgeRules.acceptModelResponse', e, jsonStr);
        return {
          ok: false,
          error: 'Assistant response is not valid JSON',
          reason: 'invalid-json',
        };
      }

      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        !('edges' in parsed) ||
        (parsed as { edges: unknown }).edges === null ||
        typeof (parsed as { edges: unknown }).edges !== 'object'
      ) {
        return {
          ok: false,
          error: 'Assistant response is missing an object-valued "edges" field',
          reason: 'missing-edges-object',
        };
      }

      const rawEdges = (parsed as { edges: Record<string, unknown> }).edges;

      const { edges, correction } = repairEdges(contract, rawEdges);
      const validated = strictValidate(contract, edges);
      if (!validated.ok) {
        return {
          ok: false,
          error: `Invalid prerequisite wiring: ${validated.error}`,
          reason: 'strict-validation-failed',
        };
      }

      return {
        ok: true,
        edges,
        correction,
        observation: buildObservation(correction),
      };
    },
  };
}
