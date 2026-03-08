import * as THREE from 'three/webgpu';

export function CrystalGlowPostProcessing() {
  // Deterministic fallback bloom-like veil to keep rendering effects
  // decoupled from composer hook availability in this pinned stack.
  return (
    <mesh position={[0, 0, -15]} rotation={[0, 0, 0]} renderOrder={999} frustumCulled={false}>
      <planeGeometry args={[100, 100]} />
      <meshBasicNodeMaterial
        transparent
        blending={THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
        color="#7dd3fc"
        opacity={0.12}
        toneMapped={false}
      />
    </mesh>
  );
}
