// @ts-nocheck — three/tsl node graphs; valid at runtime.
import * as THREE from 'three/webgpu';
import {
  abs,
  cameraPosition,
  clamp,
  float,
  Fn,
  fract,
  max,
  mix,
  mod,
  normalLocal,
  normalWorld,
  positionLocal,
  positionWorld,
  time,
  uniform,
  vec3,
} from 'three/tsl';
import { crystalLowFrequencyNoise, crystalSpikeNoise } from '../crystals/crystalNoiseNodes';

/** Shared ritual uniforms — update `.value` from React `useFrame`. */
export interface AltarRitualUniforms {
  glowIntensity: ReturnType<typeof uniform<number>>;
  cycleSpeed: ReturnType<typeof uniform<number>>;
  pulseAmplitude: ReturnType<typeof uniform<number>>;
  groundRingOpacity: ReturnType<typeof uniform<number>>;
}

export function createAltarRitualUniforms(): AltarRitualUniforms {
  return {
    glowIntensity: uniform(1.0),
    cycleSpeed: uniform(1.0),
    pulseAmplitude: uniform(0.3),
    groundRingOpacity: uniform(0.45),
  };
}

/**
 * Full-saturation HSL → RGB (h,s,l each 0–1). IQ-style hue wheel.
 */
const hslToRgb = Fn(([h, s, l]) => {
  const h6 = h.mul(6).add(vec3(0, 4, 2));
  const rgb = abs(mod(h6, float(6)).sub(float(3))).sub(float(1));
  const rgbClamped = clamp(rgb, float(0), float(1));
  return l.add(s.mul(rgbClamped.sub(float(0.5))).mul(float(1).sub(abs(l.mul(2).sub(1)))));
});

const obsidianBase = vec3(0.08, 0.08, 0.12);
const baseDark = vec3(0.06, 0.06, 0.08);

function cyclicHue(u: ReturnType<typeof createAltarRitualUniforms>['cycleSpeed']) {
  return fract(float(0.022).mul(time).mul(u));
}

export interface AltarMaterialBundle {
  nexus: THREE.MeshPhysicalNodeMaterial;
  base: THREE.MeshPhysicalNodeMaterial;
  fragment: THREE.MeshPhysicalNodeMaterial;
  groundRing: THREE.MeshBasicNodeMaterial;
  uniforms: AltarRitualUniforms;
}

export function createAltarMaterialBundle(
  envMap: THREE.Texture | null,
  uniforms: AltarRitualUniforms = createAltarRitualUniforms(),
): AltarMaterialBundle {
  const hueNode = cyclicHue(uniforms.cycleSpeed);
  const glowColor = hslToRgb(hueNode, float(0.82), float(0.52));
  const pulse = float(1).add(time.mul(1.25).sin().mul(uniforms.pulseAmplitude));

  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const fresnelRaw = float(1).sub(normalWorld.dot(viewDir).abs()).pow(float(2.2));
  const fresnelTerm = fresnelRaw.mul(float(1.4));

  const emissiveCore = glowColor.mul(uniforms.glowIntensity).mul(pulse);
  const rimBoost = emissiveCore.mul(fresnelTerm).mul(float(1.8));

  // --- Nexus crystal ---
  const nexus = new THREE.MeshPhysicalNodeMaterial({
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: true,
    envMap,
    envMapIntensity: 1.6,
  });

  const nexusPosition = Fn(() => {
    const n = normalLocal.normalize();
    const p = positionLocal;
    const low = crystalLowFrequencyNoise(p, float(42.17), float(2.2));
    return p.add(n.mul(low.mul(0.045)));
  })();

  nexus.positionNode = nexusPosition;
  nexus.colorNode = obsidianBase;
  nexus.roughnessNode = float(0.06);
  nexus.metalnessNode = float(0.02);
  nexus.transmissionNode = float(0.86);
  nexus.iorNode = float(2.0);
  nexus.thicknessNode = float(0.58);
  nexus.dispersionNode = float(0.08);
  nexus.emissiveNode = emissiveCore.add(rimBoost);

  // --- Fractured base ---
  const base = new THREE.MeshPhysicalNodeMaterial({
    side: THREE.FrontSide,
    envMap,
    envMapIntensity: 1.1,
  });

  const crack = crystalSpikeNoise(positionLocal, float(19.7), float(4.2));
  const crackMask = max(float(0), crack.sub(float(0.55))).pow(float(2.2));

  base.colorNode = baseDark;
  base.roughnessNode = float(0.32);
  base.metalnessNode = float(0.88);
  base.emissiveNode = glowColor.mul(crackMask).mul(uniforms.glowIntensity).mul(float(2.2)).mul(pulse);

  // --- Orbiting fragments ---
  const fragment = new THREE.MeshPhysicalNodeMaterial({
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: true,
    envMap,
    envMapIntensity: 1.45,
  });

  fragment.colorNode = mix(obsidianBase, glowColor, float(0.15));
  fragment.roughnessNode = float(0.12);
  fragment.metalnessNode = float(0.05);
  fragment.transmissionNode = float(0.32);
  fragment.iorNode = float(1.85);
  fragment.thicknessNode = float(0.25);
  fragment.emissiveNode = glowColor.mul(uniforms.glowIntensity).mul(float(1.35)).mul(pulse).add(
    rimBoost.mul(float(0.6)),
  );

  // --- Ground ring (additive-style color via bright emissive in basic mat) ---
  const groundRing = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  groundRing.colorNode = glowColor.mul(uniforms.groundRingOpacity).mul(uniforms.glowIntensity.mul(0.85).add(0.15));
  groundRing.opacityNode = uniforms.groundRingOpacity.mul(0.55).add(0.25);

  return { nexus, base, fragment, groundRing, uniforms };
}
