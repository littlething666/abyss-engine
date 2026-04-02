/**
 * Geometry Mapping Utilities for Multi-Floor Architecture
 */

import { useMemo } from 'react';
import * as THREE from 'three/webgpu';
import { SubjectGeometry as CoreSubjectGeometry, type GeometryType } from '../types/core';
import { Subject } from '../types/core';
import { useManifest } from '../hooks/useDeckData';

export type SubjectGeometryMap = Record<string, CoreSubjectGeometry>;

function createPlaneGeometry(): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(0.9, 0.9);
}

function createGridBoxGeometry(): THREE.BoxGeometry {
  return new THREE.BoxGeometry(0.9, 0.05, 0.9);
}

function createGridCylinderGeometry(): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16);
}

function createGridSphereGeometry(): THREE.SphereGeometry {
  return new THREE.SphereGeometry(0.4, 16, 8);
}

const gridGeometryFactories: Record<CoreSubjectGeometry['gridTile'], () => THREE.BufferGeometry> = {
  box: createGridBoxGeometry,
  cylinder: createGridCylinderGeometry,
  sphere: createGridSphereGeometry,
  octahedron: createGridBoxGeometry,
  plane: createPlaneGeometry,
};

const DEFAULT_SUBJECT_COLOR = '#777AAA';

const geometryCache = new Map<string, THREE.BufferGeometry>();

function defaultSubjectGeometry(): CoreSubjectGeometry {
  return {
    gridTile: 'box',
  };
}

function toSubjectGeometryMap(subjects: Subject[]): SubjectGeometryMap {
  const map: SubjectGeometryMap = {};
  for (const subject of subjects) {
    const castSubject = subject as { id: string; geometry?: CoreSubjectGeometry };
    if (!castSubject.geometry) {
      continue;
    }
    map[castSubject.id] = castSubject.geometry;
  }
  return map;
}

function toSubjectColorMap(subjects: Subject[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const subject of subjects) {
    const castSubject = subject as { id: string; color?: string };
    map[castSubject.id] = castSubject.color || DEFAULT_SUBJECT_COLOR;
  }
  return map;
}

export interface CrystalColors {
  outerColor: string;
  innerColor: string;
  emissiveColor: string;
}

export function getSubjectGeometry(
  subjectId: string | null,
  subjects: Subject[] = [],
): CoreSubjectGeometry {
  if (!subjectId) {
    return defaultSubjectGeometry();
  }

  const subjectMap = toSubjectGeometryMap(subjects);
  return subjectMap[subjectId] || defaultSubjectGeometry();
}

export function getSubjectGeometryByMap(
  subjectId: string | null,
  subjectsMap: SubjectGeometryMap,
): CoreSubjectGeometry {
  if (!subjectId) {
    return defaultSubjectGeometry();
  }
  return subjectsMap[subjectId] || defaultSubjectGeometry();
}

export function getSubjectColor(
  subjectId: string | null,
  subjects: Subject[] = [],
): string {
  if (!subjectId) {
    return DEFAULT_SUBJECT_COLOR;
  }
  const colorMap = toSubjectColorMap(subjects);
  return colorMap[subjectId] || DEFAULT_SUBJECT_COLOR;
}

export function getSubjectColorByMap(
  subjectId: string | null,
  colorMap: Record<string, string>,
): string {
  if (!subjectId) {
    return DEFAULT_SUBJECT_COLOR;
  }
  return colorMap[subjectId] || DEFAULT_SUBJECT_COLOR;
}

/** Grid tile mesh for the current subject (Wisdom Altar geometry is fixed in `src/graphics/altar`). */
export function getGeometryForSubject(
  subjectId: string | null,
  subjectsMap: SubjectGeometryMap = {},
): THREE.BufferGeometry {
  const cacheKey = `${subjectId || 'default'}-gridTile-${Object.keys(subjectsMap).length}`;
  const cached = geometryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const defaults = defaultSubjectGeometry();
  let geometryType: GeometryType = defaults.gridTile;
  if (subjectId) {
    const subjectGeometry = subjectsMap[subjectId];
    geometryType = subjectGeometry?.gridTile ?? geometryType;
  }

  const geometry = gridGeometryFactories[geometryType as CoreSubjectGeometry['gridTile']]() ?? createGridBoxGeometry();
  geometryCache.set(cacheKey, geometry);
  return geometry;
}

export function getGeometryForSubjectBySubjects(
  subjectId: string | null,
  subjects: Subject[] = [],
): THREE.BufferGeometry {
  const subjectsMap = toSubjectGeometryMap(subjects);
  return getGeometryForSubject(subjectId, subjectsMap);
}

export function getCrystalColors(subjectId: string | null, subjects: Subject[] = []): CrystalColors {
  const color = getSubjectColor(subjectId, subjects);
  return {
    outerColor: color,
    innerColor: color,
    emissiveColor: color,
  };
}

export function getCrystalColorsByMaps(
  subjectId: string | null,
  colorMap: Record<string, string>,
): CrystalColors {
  const color = getSubjectColorByMap(subjectId, colorMap);
  return {
    outerColor: color,
    innerColor: color,
    emissiveColor: color,
  };
}

export function getAllSubjects(): Subject[] {
  const query = useManifest();
  return query.data?.subjects ?? [];
}

export function getAllSubjectsFromMap(subjectsMap: SubjectGeometryMap): Subject[] {
  return Object.keys(subjectsMap).map((id) => ({
    id,
    name: id,
    description: '',
    themeId: '',
    color: DEFAULT_SUBJECT_COLOR,
    geometry: subjectsMap[id],
  }));
}

export function clearGeometryCache(): void {
  geometryCache.forEach((geometry) => geometry.dispose());
  geometryCache.clear();
}

export function useSubjectGeometry(
  subjectId: string | null,
): THREE.BufferGeometry {
  const manifestQuery = useManifest();
  const subjects = manifestQuery.data?.subjects ?? [];
  const map = useMemo(() => {
    const subjectMap = new Map<string, SubjectGeometryMap[string]>();
    subjects.forEach((subject) => {
      const castSubject = subject as { id: string; geometry?: CoreSubjectGeometry };
      if (castSubject.geometry) {
        subjectMap.set(castSubject.id, castSubject.geometry);
      }
    });
    return subjectMap;
  }, [subjects]);

  const subjectMap = useMemo(() => {
    const result: SubjectGeometryMap = {};
    map.forEach((geometry, id) => {
      result[id] = geometry;
    });
    return result;
  }, [map]);

  return getGeometryForSubject(subjectId, subjectMap);
}

export function useSubjectColor(subjectId: string | null): string {
  const manifestQuery = useManifest();
  const subjects = manifestQuery.data?.subjects ?? [];
  const map = useMemo(() => toSubjectColorMap(subjects), [subjects]);
  return getSubjectColorByMap(subjectId, map);
}
