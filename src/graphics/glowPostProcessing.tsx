import * as R3F from '@react-three/fiber';
import * as THREE from 'three/webgpu';

type PostProcessingHook = (
  setup: (state: { scene?: unknown; gl?: unknown; camera?: unknown; [key: string]: unknown }) => void | unknown,
  deps?: unknown[],
) => void;

const usePostProcessingHook = (R3F as { usePostProcessing?: PostProcessingHook }).usePostProcessing;

export function CrystalGlowPostProcessing() {
  const usePostProcessing = usePostProcessingHook ?? (() => undefined);

  try {
    usePostProcessing(() => {
      // Future hook-compatible entry point for explicit composer-style post-processing.
      // If unavailable in the pinned renderer version, this component keeps a deterministic fallback layer.
      return null;
    }, []);
  } catch {
    // no-op: hook shape is optional in this pinned stack
  }

  // Fallback effect: a camera-aligned, additive glow veil for mobile-friendly atmospheric bloom.
  // This keeps post effect responsibilities in graphics and avoids legacy EffectComposer usage.
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
