'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three/webgpu';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { useSubjectColor, useSubjectGeometry } from '../utils/geometryMapping';

/**
 * Grid configuration
 */
const GRID_SIZE = 9;
const TILE_SIZE = 1;

/**
 * Shared ground plane geometry
 */
const groundGeometry = new THREE.PlaneGeometry(GRID_SIZE * 1.5, GRID_SIZE * 1.5);

/**
 * Tile position data type
 */
interface TilePosition {
  key: string;
  gridX: number;
  gridZ: number;
  isCenter: boolean;
}

/**
 * 3D Grid component - renders the tile floor
 * Grid coordinates [x, z] map to Vector3(x, 0, z)
 *
 * Now supports multi-floor architecture:
 * - Uses subject-defined geometry from JSON
 * - Applies subject color to grid tiles
 */
export const Grid: React.FC = () => {
  // Get current subject ID from store
  const currentSubjectId = useStudyStore((state) => state.currentSubjectId);
  const tileGeometry = useSubjectGeometry(currentSubjectId, 'gridTile');
  const subjectColor = useSubjectColor(currentSubjectId);

  // Memoize tile positions - recalculates only if grid size changes
  const tilePositions: TilePosition[] = useMemo(() => {
    const positions: TilePosition[] = [];
    const offset = Math.floor(GRID_SIZE / 2);

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const gridX = x - offset;
        const gridZ = z - offset;
        const isCenter = gridX === 0 && gridZ === 0;

        positions.push({
          key: `tile-${x}-${z}`,
          gridX,
          gridZ,
          isCenter,
        });
      }
    }

    return positions;
  }, []);

  // Get subject-specific geometry for grid tiles
  // Get subject color for grid tiles
  // const subjectColor = getSubjectColor(currentSubjectId); // now provided by hook

  // Calculate tile colors based on subject
  const tileColor = useMemo(() => {
    if (!currentSubjectId) return '#0f1f2f';
    // Create color with proper alpha handling using Three.js
    const color = new THREE.Color(subjectColor);
    color.multiplyScalar(0.25); // Dim the color to ~25% brightness for tiles
    return '#' + color.getHexString();
  }, [subjectColor, currentSubjectId]);

  const centerTileColor = useMemo(() => {
    if (!currentSubjectId) return '#1e3a5f';
    // Create color with proper alpha handling using Three.js
    const color = new THREE.Color(subjectColor);
    color.multiplyScalar(0.5); // Dim the color to ~50% brightness for center
    return '#' + color.getHexString();
  }, [subjectColor, currentSubjectId]);

  const tileMaterial = useMemo(() => {
    const material = new THREE.MeshStandardNodeMaterial({
      color: tileColor,
      metalness: 0.3,
      roughness: 0.7,
      transparent: true,
      opacity: 0.5,
    });
    return material;
  }, [tileColor]);

  const centerTileMaterial = useMemo(() => {
    const material = new THREE.MeshStandardNodeMaterial({
      color: centerTileColor,
      metalness: 0.3,
      roughness: 0.7,
      transparent: true,
      opacity: 0.5,
    });
    return material;
  }, [centerTileColor]);

  const groundMaterial = useMemo(() => {
    return new THREE.MeshStandardNodeMaterial({
      color: '#050510',
      metalness: 0.2,
      roughness: 0.8,
    });
  }, []);

  return (
    <group>
      {/* Grid helper for visual reference */}
      <gridHelper
        args={[GRID_SIZE, GRID_SIZE, '#1e40af', '#1e3a8a']}
        position={[0, 0, 0]}
      />
      {/* Tiles - using subject-defined geometry */}
      {tilePositions.map(({ key, gridX, gridZ, isCenter }) => (
        <mesh
          key={key}
          position={[gridX * TILE_SIZE, -0.01, gridZ * TILE_SIZE]}
          rotation={[0, 0, 0]}
          geometry={tileGeometry}
          material={isCenter ? centerTileMaterial : tileMaterial}
        >
          {/* Material moved to useMemo for stable node graphs and reduced rebuilds. */}
        </mesh>
      ))}
      {/* Ground plane - using shared memoized geometry */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        geometry={groundGeometry}
        material={groundMaterial}
      >
      </mesh>
    </group>
  );
};

export default Grid;
