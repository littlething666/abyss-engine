/**
 * Subject Graph Artifact Applier — Phase 0.5 step 5.
 *
 * Composes two `ArtifactKind`s into a single composite applier:
 *   - `subject-graph-topics` (Stage A) → merges topic nodes into the
 *     existing SubjectGraph and persists via `deckWriter.upsertGraph`.
 *   - `subject-graph-edges`  (Stage B) → populates prerequisite edges
 *     via `deckWriter.upsertGraph`.
 *
 * Stage B requires the Stage A lattice `contentHash` for this run
 * (`ArtifactApplyContext.subjectGraphLatticeContentHash`, matching
 * `SubjectGraphEdgesRunInputSnapshot.lattice_artifact_content_hash`) to
 * already appear in the dedupe store. Otherwise returns
 * `{ applied: false, reason: 'missing-stage-a' }` so the composition root
 * can retry after Stage A applies or replays.
 *
 * The Subject Graph Stage B `correctPrereqEdges` deterministic
 * correction runs BEFORE the artifact reaches this applier (inside
 * `parseTopicLatticeResponse.ts` per the AGENTS.md exception), so the
 * applier always consumes corrected edges.
 *
 * Exported through `src/features/subjectGeneration/index.ts`.
 */

import type { GraphNode, SubjectGraph, TopicIconName } from '@/types/core';
import type { IDeckContentWriter, IDeckRepository } from '@/types/repository';
import type {
  ArtifactApplyContext,
  ArtifactApplier,
} from '@/features/generationContracts/artifacts/applier';
import type {
  ArtifactEnvelope,
  SubjectGraphEdgesArtifactPayload,
  SubjectGraphTopicsArtifactPayload,
} from '@/features/generationContracts';

// ---------------------------------------------------------------------------
// Dependency interface
// ---------------------------------------------------------------------------

export interface SubjectGraphApplierDeps {
  deckWriter: IDeckContentWriter;
  deckRepository: IDeckRepository;
}

// ---------------------------------------------------------------------------
// Per-kind apply helpers
// ---------------------------------------------------------------------------

async function applyTopics(
  artifact: ArtifactEnvelope<'subject-graph-topics'>,
  ctx: ArtifactApplyContext,
  deps: SubjectGraphApplierDeps,
): Promise<{ applied: boolean; reason?: 'duplicate' | 'superseded' | 'missing-stage-a' | 'invalid' }> {
  if (artifact.kind !== 'inline') {
    return { applied: false, reason: 'invalid' };
  }
  const contentHash = artifact.artifact.contentHash;
  if (await ctx.dedupeStore.has(contentHash)) {
    return { applied: false, reason: 'duplicate' };
  }

  const payload = artifact.artifact.payload as unknown as SubjectGraphTopicsArtifactPayload;
  const subjectId = ctx.subjectId;
  if (!subjectId) {
    return { applied: false, reason: 'invalid' };
  }

  // Read existing graph (if any) so we preserve themeId / title
  let existingGraph: SubjectGraph | null = null;
  try {
    existingGraph = await deps.deckRepository.getSubjectGraph(subjectId);
  } catch {
    // No existing graph — first generation pass.
  }

  const maxTier = Math.max(...payload.topics.map((t) => t.tier), existingGraph?.maxTier ?? 1);

  const newNodes: GraphNode[] = payload.topics.map((t) => ({
    topicId: t.topicId,
    title: t.title,
    iconName: t.iconName as TopicIconName,
    tier: t.tier,
    learningObjective: t.learningObjective,
    prerequisites: [] as GraphNode['prerequisites'],
  }));

  // Merge with existing nodes: new payload nodes replace same-topicId entries.
  const existingNodes = existingGraph?.nodes ?? [];
  const mergedNodes = existingNodes.filter(
    (n) => !newNodes.some((nn) => nn.topicId === n.topicId),
  );
  mergedNodes.push(...newNodes);

  const graph: SubjectGraph = {
    subjectId,
    title: existingGraph?.title ?? subjectId,
    themeId: existingGraph?.themeId ?? 'default',
    maxTier,
    nodes: mergedNodes,
  };

  await deps.deckWriter.upsertGraph(graph);
  await ctx.dedupeStore.record(contentHash, 'subject-graph-topics', ctx.now());

  return { applied: true };
}

async function applyEdges(
  artifact: ArtifactEnvelope<'subject-graph-edges'>,
  ctx: ArtifactApplyContext,
  deps: SubjectGraphApplierDeps,
): Promise<{ applied: boolean; reason?: 'duplicate' | 'superseded' | 'missing-stage-a' | 'invalid' }> {
  if (artifact.kind !== 'inline') {
    return { applied: false, reason: 'invalid' };
  }
  const contentHash = artifact.artifact.contentHash;
  if (await ctx.dedupeStore.has(contentHash)) {
    return { applied: false, reason: 'duplicate' };
  }

  const subjectId = ctx.subjectId;
  if (!subjectId) {
    return { applied: false, reason: 'invalid' };
  }

  const latticeHash = ctx.subjectGraphLatticeContentHash;
  if (!latticeHash) {
    return { applied: false, reason: 'missing-stage-a' };
  }
  if (!(await ctx.dedupeStore.has(latticeHash))) {
    return { applied: false, reason: 'missing-stage-a' };
  }

  const payload = artifact.artifact.payload as unknown as SubjectGraphEdgesArtifactPayload;

  // Read existing graph (from Stage A + any prior state)
  const existingGraph = await deps.deckRepository.getSubjectGraph(subjectId);

  // Merge edges into existing nodes
  const nodes = existingGraph.nodes.map((n) => {
    const nodeEdges = payload.edges.filter((e) => e.target === n.topicId);
    const prereqs: GraphNode['prerequisites'] = nodeEdges.map((e) => {
      if (e.minLevel != null) {
        return { topicId: e.source, minLevel: e.minLevel };
      }
      return e.source;
    });
    return { ...n, prerequisites: prereqs };
  });

  const graph: SubjectGraph = {
    ...existingGraph,
    nodes,
  };

  await deps.deckWriter.upsertGraph(graph);
  await ctx.dedupeStore.record(contentHash, 'subject-graph-edges', ctx.now());

  return { applied: true };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type SubjectGraphApplier = ArtifactApplier<
  'subject-graph-topics' | 'subject-graph-edges'
>;

export function createSubjectGraphApplier(
  deps: SubjectGraphApplierDeps,
): SubjectGraphApplier {
  return {
    kind: 'subject-graph-topics' as SubjectGraphApplier['kind'],
    async apply(
      artifact: ArtifactEnvelope,
      ctx: ArtifactApplyContext,
    ) {
      const a = artifact.kind === 'inline' ? artifact.artifact : artifact.meta;
      const k = a.kind;

      switch (k) {
        case 'subject-graph-topics':
          return applyTopics(
            artifact as ArtifactEnvelope<'subject-graph-topics'>,
            ctx,
            deps,
          );
        case 'subject-graph-edges':
          return applyEdges(
            artifact as ArtifactEnvelope<'subject-graph-edges'>,
            ctx,
            deps,
          );
        default:
          return { applied: false, reason: 'invalid' as const };
      }
    },
  };
}
