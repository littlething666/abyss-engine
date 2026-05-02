import * as THREE from 'three/webgpu';
import {
  Fn,
  texture as textureNode,
  uniform,
  uv,
} from 'three/tsl';
import { sharedDepthOcclusion } from './depthOcclusionNode';

export interface MentorBubbleMaterialUniforms {
  glyphColorUniform: ReturnType<typeof uniform>;
  ringColorUniform: ReturnType<typeof uniform>;
  ringOpacityUniform: ReturnType<typeof uniform>;
  baseOpacityUniform: ReturnType<typeof uniform>;
}

export interface MentorBubbleMaterialHandles extends MentorBubbleMaterialUniforms {
  glyphMaterial: THREE.MeshBasicNodeMaterial;
  ringMaterial: THREE.MeshBasicNodeMaterial;
}

/**
 * Creates the duo of mentor-bubble materials — ring and glyph — that
 * share a core set of uniforms so the component can drive smooth ring /
 * glyph color cross-fades from a useFrame loop without regenerating
 * the alpha-mask texture.
 *
 * - Glyph plane: `MeshBasicNodeMaterial`, color = glyphColor uniform,
 *   opacity = mask.a * baseOpacity * sharedDepthOcclusion().
 * - Ring plane: `MeshBasicNodeMaterial`, color = ringColor uniform, opacity
 *   = ringOpacity * sharedDepthOcclusion().
 */
export function createMentorBubbleMaterial(
  alphaMask: THREE.Texture,
): MentorBubbleMaterialHandles {
  const glyphColorUniform = uniform(new THREE.Color('#ffffff'));
  const ringColorUniform = uniform(new THREE.Color('#ffffff'));
  const ringOpacityUniform = uniform(0.55);
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
    ringMaterial,
    glyphColorUniform,
    ringColorUniform,
    ringOpacityUniform,
    baseOpacityUniform,
  };
}
