/** Extra pixels beyond node circle for territory fill/stroke breathing room. */
export const DEFAULT_CLUSTER_TERRITORY_PAD_PX = 10;

export interface ClusterTerritoryCircle {
  clusterIndex: number;
  subjectId: string;
  cx: number;
  cy: number;
  r: number;
}

export interface ClusterTerritoryNodePosition {
  clusterIndex: number;
  x: number;
  y: number;
}

/**
 * One soft circle per subject cluster: centroid of node centers, radius encloses all node circles plus pad.
 * Omits clusters with no positioned nodes.
 */
export function computeClusterTerritoryCircles(
  subjectIdsOrdered: string[],
  positions: ClusterTerritoryNodePosition[],
  nodeRadius: number,
  territoryPadPx: number = DEFAULT_CLUSTER_TERRITORY_PAD_PX,
): ClusterTerritoryCircle[] {
  const out: ClusterTerritoryCircle[] = [];

  for (let clusterIndex = 0; clusterIndex < subjectIdsOrdered.length; clusterIndex += 1) {
    const subjectId = subjectIdsOrdered[clusterIndex]!;
    const subset = positions.filter((p) => p.clusterIndex === clusterIndex);
    if (subset.length === 0) {
      continue;
    }

    let sx = 0;
    let sy = 0;
    for (const p of subset) {
      sx += p.x;
      sy += p.y;
    }
    const n = subset.length;
    const cx = sx / n;
    const cy = sy / n;

    let maxDist = 0;
    for (const p of subset) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy);
      if (d > maxDist) {
        maxDist = d;
      }
    }

    const r = maxDist + nodeRadius + territoryPadPx;
    out.push({ clusterIndex, subjectId, cx, cy, r });
  }

  return out;
}
