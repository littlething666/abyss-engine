'use client';

import type { SimulationNodeDatum } from 'd3';
import { zoom, zoomIdentity } from 'd3';
import type { Force, Simulation } from 'd3-force';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from 'd3-force';
import { select } from 'd3-selection';
import 'd3-transition';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { topicRefKey } from '@/lib/topicRef';
import { useProgressionStore } from '@/features/progression';
import { getTopicUnlockStatus, getVisibleTopicIds } from '@/features/progression/progressionUtils';
import type { SubjectGraphsForceGraphData, SubjectGraphForceNode } from '@/lib/subjectGraphsForceGraphData';
import {
  DEFAULT_CLUSTER_TERRITORY_PAD_PX,
  computeClusterTerritoryCircles,
} from '@/lib/studyForceGraphClusterTerritories';
import {
  buildSubjectGraphsForceGraphData,
  clusterCentersOnCircle,
  computeTopicGraphBfsDistances,
  filterSubjectGraphsForceGraphDataByMaxHop,
  resolveEffectiveTopicGraphDistances,
} from '@/lib/subjectGraphsForceGraphData';
import type { ActiveCrystal, SubjectGraph, TopicRef } from '@/types/core';

import { cn } from '@/lib/utils';

type SimNode = SubjectGraphForceNode & SimulationNodeDatum;

type LinkDatum = { source: string | SimNode; target: string | SimNode };

type LayoutSnapshot = Pick<SimNode, 'x' | 'y' | 'vx' | 'vy' | 'fx' | 'fy'>;

const NODE_FADE_MS = 340;
const LINK_FADE_MS = 300;

/** Unreachable or BFS distance ≥ 2 → dimmed (50%). */
export function nodeOpacityFromBfsDist(dist: number | undefined): number {
  if (dist === undefined) {
    return 0.5;
  }
  return dist <= 1 ? 1 : 0.5;
}

function linkNodeX(endpoint: string | SimNode): number {
  if (typeof endpoint === 'string') {
    return 0;
  }
  return endpoint.x ?? 0;
}

function linkNodeY(endpoint: string | SimNode): number {
  if (typeof endpoint === 'string') {
    return 0;
  }
  return endpoint.y ?? 0;
}

function styleForNode(
  d: SimNode,
  activeCrystals: ActiveCrystal[],
  unlockPoints: number,
  allGraphs: SubjectGraph[],
  selectedTopicKey: string | null,
): { fill: string; stroke: string; strokeWidth: number } {
  const ref: TopicRef = { subjectId: d.subjectId, topicId: d.topicId };
  const tKey = topicRefKey(ref);
  const hasCrystal = activeCrystals.some(
    (c) => c.subjectId === d.subjectId && c.topicId === d.topicId,
  );
  const unlockStatus = getTopicUnlockStatus(ref, activeCrystals, unlockPoints, allGraphs, []);
  const { hasPrerequisites: masteryGatesMet, canUnlock } = unlockStatus;

  let base: { fill: string; stroke: string; strokeWidth: number };
  if (hasCrystal) {
    base = {
      fill: 'var(--chart-1)',
      stroke: 'var(--foreground)',
      strokeWidth: 3,
    };
  } else if (masteryGatesMet) {
    base = {
      fill: canUnlock ? 'var(--accent)' : 'var(--muted)',
      stroke: '#ffffff',
      strokeWidth: 4,
    };
  } else {
    base = {
      fill: 'var(--muted)',
      stroke: 'var(--border)',
      strokeWidth: 1.5,
    };
  }

  if (selectedTopicKey && tKey === selectedTopicKey) {
    return {
      ...base,
      stroke: 'var(--ring)',
      strokeWidth: base.strokeWidth + 2,
    };
  }
  return base;
}

/** Updates node circle and label styles without restarting the force simulation. */
function paintTopicNodeVisuals(
  svgRoot: SVGSVGElement,
  activeCrystals: ActiveCrystal[],
  unlockPoints: number,
  allGraphs: SubjectGraph[],
  selectedTopicKey: string | null,
  bfsDistances: ReadonlyMap<string, number>,
) {
  const root = select(svgRoot);
  root
    .selectAll<SVGCircleElement, SimNode>('g.plot-view g.nodes circle')
    .each(function paintCircle(d) {
      const s = styleForNode(d, activeCrystals, unlockPoints, allGraphs, selectedTopicKey);
      const op = nodeOpacityFromBfsDist(bfsDistances.get(d.id));
      select(this)
        .attr('fill', s.fill)
        .attr('stroke', s.stroke)
        .attr('stroke-width', s.strokeWidth)
        .attr('opacity', op);
    });
  root
    .selectAll<SVGTextElement, SimNode>('g.plot-view g.labels text')
    .each(function paintLabel(d) {
      const isSelected = Boolean(
        selectedTopicKey && topicRefKey({ subjectId: d.subjectId, topicId: d.topicId }) === selectedTopicKey,
      );
      const op = nodeOpacityFromBfsDist(bfsDistances.get(d.id));
      select(this)
        .attr('opacity', op)
        .attr('fill-opacity', isSelected ? 0.95 : 0.78)
        .attr('font-weight', isSelected ? 600 : 500);
    });
}

export interface StudyForceGraphProps {
  /** Full curriculum graphs from the manifest; filtered by `SubjectNavigation` floor (`currentSubjectId`). */
  allGraphs: SubjectGraph[];
  /** Composite force-graph node ids (`compositeTopicNodeId`) for crystals — drives BFS seeds. */
  unlockedNodeIds: string[];
  activeCrystals: ActiveCrystal[];
  unlockPoints: number;
  /** Highlights the matching topic (`topicRefKey`). */
  selectedTopicKey?: string | null;
  /** Invoked when the user activates a topic node (click, tap, or keyboard). */
  onSelectTopic?: (ref: TopicRef) => void;
  /** Invoked when the user activates the empty graph background (tap outside nodes). */
  onClearSelection?: () => void;
  /** `null` = show full graph (all nodes); integer = max BFS hop from seeds. */
  maxHop?: number | null;
  className?: string;
}

const NODE_RADIUS = 14;
/** Vertical offset from node center to label (text middle), below the circle. */
const LABEL_Y_OFFSET = NODE_RADIUS + 12;
const TOPIC_TITLE_MAX_CHARS = 28;

function truncateTopicTitle(title: string, maxChars = TOPIC_TITLE_MAX_CHARS): string {
  const t = title.trim();
  if (t.length <= maxChars) {
    return t;
  }
  return `${t.slice(0, Math.max(1, maxChars - 1))}...`;
}

/** ~11px UI font: upper bound for half-width of truncated titles (horizontal clip guard). */
const LABEL_HALF_WIDTH_EST = Math.min(112, (TOPIC_TITLE_MAX_CHARS * 6.35) / 2);

type ViewportCenterBounds = { minX: number; maxX: number; minY: number; maxY: number };

function nodeCenterViewportBounds(width: number, height: number): ViewportCenterBounds {
  const insetX = NODE_RADIUS + 8 + LABEL_HALF_WIDTH_EST;
  const insetTop = NODE_RADIUS + 10;
  const insetBottom = LABEL_Y_OFFSET + 16;
  let minX = insetX;
  let maxX = width - insetX;
  let minY = insetTop;
  let maxY = height - insetBottom;
  if (minX >= maxX) {
    const mid = width / 2;
    minX = mid;
    maxX = mid;
  }
  if (minY >= maxY) {
    const mid = height / 2;
    minY = mid;
    maxY = mid;
  }
  return { minX, maxX, minY, maxY };
}

/** Keeps node centers (and labels) inside the SVG; zeros velocity on bounce. */
function clampNodeCenterToViewport(d: SimNode, b: ViewportCenterBounds) {
  const ox = d.x ?? b.minX;
  const oy = d.y ?? b.minY;
  const x = Math.min(b.maxX, Math.max(b.minX, ox));
  const y = Math.min(b.maxY, Math.max(b.minY, oy));
  if (ox !== x && d.vx != null) {
    d.vx = 0;
  }
  if (oy !== y && d.vy != null) {
    d.vy = 0;
  }
  d.x = x;
  d.y = y;
  if (d.fx != null) {
    d.fx = x;
  }
  if (d.fy != null) {
    d.fy = y;
  }
}

/**
 * When two node centers lie within `xBand` px horizontally but are closer than `minCenterYGap`
 * vertically, nudges them apart on y. Reduces stacked labels for topics that share a column.
 */
function forceVerticalSpreadWhenXNear(
  xBand: number,
  minCenterYGap: number,
  strength: number,
): Force<SimNode, undefined> {
  let nodes: SimNode[];

  function force(alpha: number) {
    const k = strength * alpha;
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const ax = a.x ?? 0;
        const bx = b.x ?? 0;
        const ay = a.y ?? 0;
        const by = b.y ?? 0;
        if (Math.abs(ax - bx) >= xBand) {
          continue;
        }

        const dy = ay - by;
        const ady = Math.abs(dy);
        if (ady >= minCenterYGap) {
          continue;
        }

        const deficit = minCenterYGap - ady;
        const impulse = k * deficit;

        if (Math.abs(dy) < 1e-6) {
          const s = a.id < b.id ? 1 : -1;
          const nudge = impulse * 0.5;
          a.vy = (a.vy ?? 0) - s * nudge;
          b.vy = (b.vy ?? 0) + s * nudge;
        } else if (dy < 0) {
          // a above b: push a up, b down
          a.vy = (a.vy ?? 0) - impulse;
          b.vy = (b.vy ?? 0) + impulse;
        } else {
          a.vy = (a.vy ?? 0) + impulse;
          b.vy = (b.vy ?? 0) - impulse;
        }
      }
    }
  }

  force.initialize = (initNodes: SimNode[]) => {
    nodes = initNodes;
  };

  return force;
}

/** Horizontal proximity (px): centers within this band compete for vertical separation. */
const X_NEIGHBOR_SPREAD_BAND_PX = 250;

/** Floor for focal-circle inset so tiny viewports stay valid. */
const MIN_FOCAL_CIRCLE_INSET_PX = 28;
/** Reduces padding passed to `clusterCentersOnCircle` so focal points sit on a wider circle (more cluster separation). */
const CLUSTER_FOCAL_SPREAD_PX = 40;

type ClusterTerritoryDatum = { subjectId: string; clusterIndex: number };

export function StudyForceGraph({
  allGraphs,
  unlockedNodeIds,
  activeCrystals,
  unlockPoints,
  selectedTopicKey = null,
  onSelectTopic,
  onClearSelection,
  maxHop = null,
  className,
}: StudyForceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const currentSubjectId = useProgressionStore((s) => s.currentSubjectId);

  const visibleGraphs = useMemo(() => {
    if (!allGraphs.length) {
      return [];
    }
    if (!currentSubjectId) {
      return allGraphs;
    }
    return allGraphs.filter((g) => g.subjectId === currentSubjectId);
  }, [allGraphs, currentSubjectId]);

  const curriculumVisibleGraphs = useMemo(() => {
    return visibleGraphs.map((g) => {
      const ids = getVisibleTopicIds(g, activeCrystals);
      return { ...g, nodes: g.nodes.filter((n) => ids.has(n.topicId)) };
    });
  }, [visibleGraphs, activeCrystals]);

  const graphData = useMemo((): SubjectGraphsForceGraphData | null => {
    if (!curriculumVisibleGraphs.length) {
      return null;
    }
    return buildSubjectGraphsForceGraphData(curriculumVisibleGraphs);
  }, [curriculumVisibleGraphs]);

  const bfsResult = useMemo(() => {
    if (!graphData) {
      return null;
    }
    return computeTopicGraphBfsDistances(graphData, unlockedNodeIds);
  }, [graphData, unlockedNodeIds]);

  const effectiveDistances = useMemo(() => {
    if (!graphData || !bfsResult) {
      return null;
    }
    return resolveEffectiveTopicGraphDistances(graphData, unlockedNodeIds, bfsResult.distances);
  }, [graphData, bfsResult, unlockedNodeIds]);

  const displayData = useMemo((): SubjectGraphsForceGraphData | null => {
    if (!graphData || !effectiveDistances) {
      return null;
    }
    if (maxHop === null) {
      return graphData;
    }
    return filterSubjectGraphsForceGraphDataByMaxHop(graphData, effectiveDistances, maxHop);
  }, [graphData, effectiveDistances, maxHop]);

  const progressionRef = useRef({
    activeCrystals,
    unlockPoints,
  });
  progressionRef.current = { activeCrystals, unlockPoints };
  const graphsRef = useRef(curriculumVisibleGraphs);
  graphsRef.current = curriculumVisibleGraphs;
  const selectedTopicKeyRef = useRef(selectedTopicKey);
  selectedTopicKeyRef.current = selectedTopicKey;
  const onSelectTopicRef = useRef(onSelectTopic);
  onSelectTopicRef.current = onSelectTopic;
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;
  /** Preserves force layout between graph data updates for stable enter/exit transitions. */
  const layoutSnapshotRef = useRef<Map<string, LayoutSnapshot>>(new Map());
  const simulationRef = useRef<Simulation<SimNode, undefined> | null>(null);
  /** Stable key so progression-driven node colors repaint without waiting for simulation ticks. */
  const progressionPaintKey = useMemo(() => {
    const unlocked = [...unlockedNodeIds].sort().join('\0');
    const crystalTopics = [...new Set(activeCrystals.map((c) => `${c.subjectId}\u001f${c.topicId}`))].sort().join('|');
    const distKey =
      effectiveDistances == null
        ? ''
        : [...effectiveDistances.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${v}`)
            .join('|');
    return `${unlocked}#${unlockPoints}#${crystalTopics}#${distKey}`;
  }, [unlockedNodeIds, activeCrystals, unlockPoints, effectiveDistances]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) {
        return;
      }
      const w = Math.max(0, Math.floor(cr.width));
      const h = Math.max(0, Math.floor(cr.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || size.w < 32 || size.h < 32 || !displayData || displayData.nodes.length === 0 || !effectiveDistances) {
      return;
    }

    const depthDistances = effectiveDistances;
    const linkOpacity = (d: LinkDatum) => {
      const sid = typeof d.source === 'object' ? d.source.id : d.source;
      const tid = typeof d.target === 'object' ? d.target.id : d.target;
      return Math.min(nodeOpacityFromBfsDist(depthDistances.get(sid)), nodeOpacityFromBfsDist(depthDistances.get(tid)));
    };

    const { w, h } = size;
    const vp = nodeCenterViewportBounds(w, h);
    const clusterPadding = Math.max(56, vp.minX, vp.minY, h - vp.maxY);
    const focalCirclePadding = Math.max(
      MIN_FOCAL_CIRCLE_INSET_PX,
      clusterPadding - CLUSTER_FOCAL_SPREAD_PX,
    );
    const centers = clusterCentersOnCircle(
      displayData.subjectIdsOrdered.length,
      w,
      h,
      focalCirclePadding,
    );
    const cx = w / 2;
    const cy = h / 2;
    const snap = layoutSnapshotRef.current;
    const nextIds = new Set(displayData.nodes.map((n) => n.id));
    for (const id of snap.keys()) {
      if (!nextIds.has(id)) {
        snap.delete(id);
      }
    }

    const simNodes: SimNode[] = displayData.nodes.map((n) => {
      const prev = snap.get(n.id);
      if (prev && prev.x != null && prev.y != null) {
        return {
          ...n,
          x: prev.x,
          y: prev.y,
          vx: prev.vx,
          vy: prev.vy,
          fx: prev.fx,
          fy: prev.fy,
        };
      }
      const rawX = cx + (Math.random() - 0.5) * 24;
      const rawY = cy + (Math.random() - 0.5) * 24;
      return {
        ...n,
        x: Math.min(vp.maxX, Math.max(vp.minX, rawX)),
        y: Math.min(vp.maxY, Math.max(vp.minY, rawY)),
      };
    });

    const linkData: LinkDatum[] = displayData.links.map((l) => ({
      source: l.source,
      target: l.target,
    }));

    const linkKey = (d: LinkDatum) => {
      const s = typeof d.source === 'object' ? d.source.id : d.source;
      const t = typeof d.target === 'object' ? d.target.id : d.target;
      return `${s}:${t}`;
    };

    const svg = select(svgEl);
    svg.attr('width', w).attr('height', h).attr('role', 'img').attr('aria-label', 'Curriculum topic force graph');

    let viewG = svg.select<SVGGElement>('g.plot-view');
    if (viewG.empty()) {
      viewG = svg.append('g').attr('class', 'plot-view');
      viewG.attr('transform', zoomIdentity.toString());
      viewG
        .append('rect')
        .attr('class', 'hit-surface')
        .attr('width', w)
        .attr('height', h)
        .attr('fill', 'transparent')
        .attr('pointer-events', 'all')
        .style('cursor', 'default')
        .on('click', (event: MouseEvent) => {
          event.stopPropagation();
          onClearSelectionRef.current?.();
        });
      viewG.append('g').attr('class', 'cluster-territories');
      viewG.append('g').attr('class', 'links');
      viewG.append('g').attr('class', 'nodes');
      viewG.append('g').attr('class', 'labels');
    } else {
      viewG.select('rect.hit-surface').attr('width', w).attr('height', h);
      if (viewG.select('g.cluster-territories').empty()) {
        viewG.insert('g', 'g.links').attr('class', 'cluster-territories');
      }
    }

    const territoryG = viewG.select<SVGGElement>('g.cluster-territories');
    const territoryData: ClusterTerritoryDatum[] = displayData.subjectIdsOrdered.map((subjectId, clusterIndex) => ({
      subjectId,
      clusterIndex,
    }));

    const territorySel = territoryG
      .selectAll<SVGCircleElement, ClusterTerritoryDatum>('circle')
      .data(territoryData, (d) => d.subjectId);

    territorySel.exit().remove();

    const territoryEnter = territorySel
      .enter()
      .append('circle')
      .attr('fill', 'var(--muted)')
      .attr('fill-opacity', 0.14)
      .attr('stroke', 'var(--border)')
      .attr('stroke-opacity', 0.42)
      .attr('stroke-width', 1)
      .style('pointer-events', 'none');

    const territoryMerge = territoryEnter.merge(territorySel);

    const initialTerritoryGeoms = computeClusterTerritoryCircles(
      displayData.subjectIdsOrdered,
      simNodes.map((d) => ({
        clusterIndex: d.clusterIndex,
        x: d.x ?? 0,
        y: d.y ?? 0,
      })),
      NODE_RADIUS,
      DEFAULT_CLUSTER_TERRITORY_PAD_PX,
    );
    const initialTerritoryBySubject = new Map(initialTerritoryGeoms.map((g) => [g.subjectId, g]));
    territoryMerge.each(function seedTerritory(d) {
      const geo = initialTerritoryBySubject.get(d.subjectId);
      if (!geo) {
        return;
      }
      select(this).attr('cx', geo.cx).attr('cy', geo.cy).attr('r', geo.r);
    });

    const linkG = viewG.select<SVGGElement>('g.links');
    const nodeG = viewG.select<SVGGElement>('g.nodes');
    const labelG = viewG.select<SVGGElement>('g.labels');

    const prevSim = simulationRef.current;
    if (prevSim) {
      prevSim.on('tick', null);
      prevSim.stop();
    }

    const linkForce = forceLink<SimNode, LinkDatum>(linkData)
      .id((d) => d.id)
      .distance(52)
      .strength(0.7);

    const clusterStrength = displayData.subjectIdsOrdered.length <= 1 ? 0.08 : 0.14;

    const minYGapForColumnNeighbors = LABEL_Y_OFFSET + NODE_RADIUS + 10;

    const simulation = forceSimulation(simNodes)
      .force('link', linkForce)
      .force('charge', forceManyBody().strength(-140))
      .force('collide', forceCollide(NODE_RADIUS + 12))
      .force(
        'xNeighborY',
        forceVerticalSpreadWhenXNear(X_NEIGHBOR_SPREAD_BAND_PX, minYGapForColumnNeighbors, 0.32),
      )
      .force(
        'x',
        forceX<SimNode>((d) => centers[d.clusterIndex]?.x ?? cx).strength(clusterStrength),
      )
      .force(
        'y',
        forceY<SimNode>((d) => centers[d.clusterIndex]?.y ?? cy).strength(clusterStrength),
      )
      .alphaDecay(0.022)
      .velocityDecay(0.45);

    simulationRef.current = simulation;

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 4])
      .extent([
        [0, 0],
        [w, h],
      ])
      .filter((event) => {
        if (event.type === 'wheel') {
          event.preventDefault();
          return true;
        }
        const t = event.target;
        if (t instanceof Element && t.closest('circle')) {
          return false;
        }
        return (!event.ctrlKey || event.type === 'wheel') && !event.button;
      })
      .on('zoom', (event) => {
        viewG.attr('transform', event.transform.toString());
      });

    svg.on('.zoom', null);
    svg.call(zoomBehavior);

    const lineSel = linkG
      .selectAll<SVGLineElement, LinkDatum>('line')
      .data(linkData, linkKey);

    lineSel.interrupt();
    lineSel
      .exit()
      .interrupt()
      .transition()
      .duration(LINK_FADE_MS)
      .attr('opacity', 0)
      .remove();

    const lineEnter = lineSel
      .enter()
      .append('line')
      .attr('opacity', 0)
      .attr('stroke', 'var(--border)')
      .attr('stroke-opacity', 0.55)
      .attr('stroke-width', 1.25)
      .style('pointer-events', 'none');

    lineSel.attr('opacity', (d) => linkOpacity(d));

    lineEnter.transition().duration(LINK_FADE_MS).attr('opacity', (d) => linkOpacity(d));

    const lineMerge = lineEnter.merge(lineSel);

    const circleSel = nodeG.selectAll<SVGCircleElement, SimNode>('circle').data(simNodes, (d) => d.id);

    circleSel.interrupt();
    circleSel
      .exit()
      .interrupt()
      .transition()
      .duration(NODE_FADE_MS)
      .attr('opacity', 0)
      .remove();

    const circleEnter = circleSel
      .enter()
      .append('circle')
      .attr('cx', (d) => d.x ?? 0)
      .attr('cy', (d) => d.y ?? 0)
      .attr('opacity', 0)
      .attr('r', NODE_RADIUS)
      .attr('tabindex', 0)
      .each(function eachNode(d) {
        const s = styleForNode(
          d,
          progressionRef.current.activeCrystals,
          progressionRef.current.unlockPoints,
          graphsRef.current,
          selectedTopicKeyRef.current,
        );
        select(this)
          .attr('fill', s.fill)
          .attr('stroke', s.stroke)
          .attr('stroke-width', s.strokeWidth)
          .attr('aria-label', `${d.title}, tier ${d.tier}`);
      });

    circleSel.attr('opacity', (d) => nodeOpacityFromBfsDist(depthDistances.get(d.id)));

    circleEnter
      .transition()
      .duration(NODE_FADE_MS)
      .attr('opacity', (d) => nodeOpacityFromBfsDist(depthDistances.get(d.id)));

    const circleMerge = circleEnter.merge(circleSel);

    const textSel = labelG.selectAll<SVGTextElement, SimNode>('text').data(simNodes, (d) => d.id);

    textSel.interrupt();
    textSel
      .exit()
      .interrupt()
      .transition()
      .duration(NODE_FADE_MS)
      .attr('opacity', 0)
      .remove();

    const textEnter = textSel
      .enter()
      .append('text')
      .attr('x', (d) => d.x ?? 0)
      .attr('y', (d) => (d.y ?? 0) + LABEL_Y_OFFSET)
      .attr('opacity', 0)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .style('pointer-events', 'none')
      .style('user-select', 'none')
      .attr('font-size', 11)
      .attr('fill', 'currentColor')
      .text((d) => truncateTopicTitle(d.title));

    textSel.attr('opacity', (d) => nodeOpacityFromBfsDist(depthDistances.get(d.id)));

    textEnter
      .transition()
      .duration(NODE_FADE_MS)
      .attr('opacity', (d) => nodeOpacityFromBfsDist(depthDistances.get(d.id)));

    const textMerge = textEnter.merge(textSel);

    circleMerge.on('click', function handleCircleClick(this: SVGCircleElement, event: MouseEvent) {
      event.stopPropagation();
      const d = select(this).datum() as SimNode;
      onSelectTopicRef.current?.({ subjectId: d.subjectId, topicId: d.topicId });
    });

    circleMerge.on('keydown', function handleKeydown(this: SVGCircleElement, event: Event) {
      const ke = event as KeyboardEvent;
      if (ke.key !== 'Enter' && ke.key !== ' ') {
        return;
      }
      ke.preventDefault();
      ke.stopPropagation();
      const d = select(this).datum() as SimNode;
      onSelectTopicRef.current?.({ subjectId: d.subjectId, topicId: d.topicId });
    });

    simulation.on('tick', () => {
      for (const d of simNodes) {
        clampNodeCenterToViewport(d, vp);
        snap.set(d.id, {
          x: d.x,
          y: d.y,
          vx: d.vx,
          vy: d.vy,
          fx: d.fx,
          fy: d.fy,
        });
      }

      const territoryGeoms = computeClusterTerritoryCircles(
        displayData.subjectIdsOrdered,
        simNodes.map((d) => ({
          clusterIndex: d.clusterIndex,
          x: d.x ?? 0,
          y: d.y ?? 0,
        })),
        NODE_RADIUS,
        DEFAULT_CLUSTER_TERRITORY_PAD_PX,
      );
      const territoryBySubject = new Map(territoryGeoms.map((g) => [g.subjectId, g]));

      territoryMerge.each(function updateTerritory(d) {
        const geo = territoryBySubject.get(d.subjectId);
        if (!geo) {
          return;
        }
        select(this).attr('cx', geo.cx).attr('cy', geo.cy).attr('r', geo.r);
      });

      lineMerge
        .attr('x1', (d) => linkNodeX(d.source))
        .attr('y1', (d) => linkNodeY(d.source))
        .attr('x2', (d) => linkNodeX(d.target))
        .attr('y2', (d) => linkNodeY(d.target))
        .attr('opacity', (d) => linkOpacity(d));

      circleMerge
        .attr('cx', (d) => d.x ?? 0)
        .attr('cy', (d) => d.y ?? 0)
        .attr('opacity', (d) => nodeOpacityFromBfsDist(depthDistances.get(d.id)))
        .each(function eachTick(d) {
          const s = styleForNode(
            d,
            progressionRef.current.activeCrystals,
            progressionRef.current.unlockPoints,
            graphsRef.current,
            selectedTopicKeyRef.current,
          );
          select(this).attr('fill', s.fill).attr('stroke', s.stroke).attr('stroke-width', s.strokeWidth);
        });

      textMerge
        .attr('x', (d) => d.x ?? 0)
        .attr('y', (d) => (d.y ?? 0) + LABEL_Y_OFFSET)
        .text((d) => truncateTopicTitle(d.title))
        .attr('opacity', (d) => nodeOpacityFromBfsDist(depthDistances.get(d.id)))
        .each(function eachLabelTick(d) {
          const sel = selectedTopicKeyRef.current;
          const isSelected = Boolean(
            sel && topicRefKey({ subjectId: d.subjectId, topicId: d.topicId }) === sel,
          );
          select(this)
            .attr('fill-opacity', isSelected ? 0.95 : 0.78)
            .attr('font-weight', isSelected ? 600 : 500);
        });
    });

    simulation.alpha(1).restart();

    return () => {
      svg.on('.zoom', null);
      simulation.on('tick', null);
      simulation.stop();
      simulationRef.current = null;
    };
  }, [displayData, effectiveDistances, size.w, size.h, maxHop]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !displayData || displayData.nodes.length === 0 || !effectiveDistances) {
      return;
    }
    paintTopicNodeVisuals(
      svgEl,
      activeCrystals,
      unlockPoints,
      visibleGraphs,
      selectedTopicKey,
      effectiveDistances,
    );
  }, [selectedTopicKey, progressionPaintKey, displayData, visibleGraphs, effectiveDistances]);

  return (
    <div
      ref={containerRef}
      className={cn('h-full w-full min-h-0', className)}
    >
      {size.w >= 32 && size.h >= 32 && displayData && displayData.nodes.length > 0 ? (
        <svg ref={svgRef} className="block h-full w-full text-foreground" />
      ) : (
        <div className="text-muted-foreground flex h-full min-h-[12rem] items-center justify-center text-sm">
          {!allGraphs.length
            ? 'No curriculum topics to display.'
            : !visibleGraphs.length
              ? 'No graph for this subject.'
              : graphData && graphData.nodes.length === 0
                ? 'No curriculum topics to display.'
                : graphData && displayData && displayData.nodes.length === 0
                  ? 'No topics in this hop range.'
                  : 'Resizing…'}
        </div>
      )}
    </div>
  );
}
