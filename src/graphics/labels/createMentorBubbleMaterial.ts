import * as THREE from 'three/webgpu';
import {
  Fn,
  texture as textureNode,
  uniform,
  uv,
  vec2,
} from 'three/tsl';
import { sharedDepthOcclusion } from './depthOcclusionNode';

export interface MentorBubbleMaterialUniforms {
  glyphColorUniform: ReturnType<typeof uniform>;
  glowColorUniform: ReturnType<typeof uniform>;
  ringColorUniform: ReturnType<typeof uniform>;
  ringOpacityUniform: ReturnType<typeof uniform>;
  glowOpacityUniform: ReturnType<typeof uniform>;
  baseOpacityUniform: ReturnType<typeof uniform>;
}

export interface MentorBubbleMaterialHandles extends MentorBubbleMaterialUniforms {
  glyphMaterial: THREE.MeshBasicNodeMaterial;
  haloMaterial: THREE.MeshBasicNodeMaterial;
  ringMaterial: THREE.MeshBasicNodeMaterial;
}

/** Halo blur half-step in UV space. */
const HALO_BLUR_OFFSET = 1 / 96;

/**
 * Creates the trio of mentor-bubble materials — ring, glyph, halo — that
 * share a single set of uniforms so the component can drive smooth ring /
 * glyph / halo color cross-fades from a useFrame loop without regenerating
 * the alpha-mask texture.
 *
 * - Glyph plane: `MeshBasicNodeMaterial`, color = glyphColor uniform,
 *   opacity = mask.a * baseOpacity * sharedDepthOcclusion().
 * - Halo plane: `MeshBasicNodeMaterial`, additive blending, depthWrite off,
 *   color = glowColor uniform, opacity = (avg of 4-tap cross-blur of the
 *   mask alpha) * glowOpacity * sharedDepthOcclusion().
 * - Ring plane: `MeshBasicNodeMaterial`, color = ringColor uniform, opacity
 *   = ringOpacity * sharedDepthOcclusion().
 */
export function createMentorBubbleMaterial(
  alphaMask: THREE.Texture,
): MentorBubbleMaterialHandles {
  const glyphColorUniform = uniform(new THREE.Color('#ffffff'));
  const glowColorUniform = uniform(new THREE.Color('#ffffff'));
  const ringColorUniform = uniform(new THREE.Color('#ffffff'));
  const ringOpacityUniform = uniform(0.55);
  const glowOpacityUniform = uniform(0.55);
  const baseOpacityUniform = uniform(1);

  // ---- Glyph material ----
  const glyphMaterial = new THREE.MeshBasicNodeMaterial();
  glyphMaterial.transparent = true;
  glyphMaterial.depthWrite = false;
  glyphMaterial.depthTest = true;
  glyphMaterial.toneMapped = false;
  glyphMaterial.side = THREE.FrontSide;
  glyphMaterial.colorNode = Fn(() => glyphColorUniform)();
  glyphMaterial.opacityNode = Fn(() => {
    const sampled = textureNode(alphaMask, uv());
    return sampled.a.mul(baseOpacityUniform).mul(sharedDepthOcclusion());
  })();

  // ---- Halo material (additive cross-blur) ----
  const haloMaterial = new THREE.MeshBasicNodeMaterial();
  haloMaterial.transparent = true;
  haloMaterial.depthWrite = false;
  haloMaterial.depthTest = true;
  haloMaterial.toneMapped = false;
  haloMaterial.side = THREE.FrontSide;
  haloMaterial.blending = THREE.AdditiveBlending;
  haloMaterial.colorNode = Fn(() => glowColorUniform)();
  haloMaterial.opacityNode = Fn(() => {
    const off = HALO_BLUR_OFFSET;
    const baseUv = uv();
    const ax = textureNode(alphaMask, baseUv.add(vec2(off, 0))).a;
    const bx = textureNode(alphaMask, baseUv.add(vec2(-off, 0))).a;
    const ay = textureNode(alphaMask, baseUv.add(vec2(0, off))).a;
    const by = textureNode(alphaMask, baseUv.add(vec2(0, -off))).a;
    // Average of the four cross-blur samples; cheap separable blur.
    const blurred = ax.add(bx).add(ay).add(by).mul(0.25);
    return blurred.mul(glowOpacityUniform).mul(sharedDepthOcclusion());
  })();

  // ---- Ring material ----
  const ringMaterial = new THREE.MeshBasicNodeMaterial();
  ringMaterial.transparent = true;
  ringMaterial.depthWrite = false;
  ringMaterial.depthTest = true;
  ringMaterial.toneMapped = false;
  ringMaterial.side = THREE.FrontSide;
  ringMaterial.colorNode = Fn(() => ringColorUniform)();
  ringMaterial.opacityNode = Fn(() =>
    ringOpacityUniform.mul(sharedDepthOcclusion()),
  )();

  return {
    glyphMaterial,
    haloMaterial,
    ringMaterial,
    glyphColorUniform,
    glowColorUniform,
    ringColorUniform,
    ringOpacityUniform,
    glowOpacityUniform,
    baseOpacityUniform,
  };
}
