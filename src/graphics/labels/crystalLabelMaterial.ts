import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  linearDepth,
  smoothstep,
  texture as textureNode,
  uniform,
  uv,
  viewportLinearDepth,
} from 'three/tsl';
import { LABEL_OCCLUSION_FADE_BAND } from './crystalLabelConstants';

export interface CrystalLabelMaterialHandles {
  material: THREE.MeshBasicNodeMaterial;
  baseOpacityUniform: ReturnType<typeof uniform>;
}

/**
 * Creates a billboard-ready MeshBasicNodeMaterial that samples a canvas-rasterized
 * label texture for color, and the viewport linear depth buffer for smooth
 * occlusion against any opaque geometry in the scene.
 *
 * Opacity pipeline:
 *   labelLinearDepth   := linearDepth()              (orthographic linear depth, matches viewport)
 *   sceneLinearDepth   := viewportLinearDepth        (opaque depth, linearized)
 *   depthDiff          := sceneLinearDepth - labelLinearDepth
 *     > 0  → nothing in front of the label (fully visible)
 *     ~ 0  → silhouette edge (smooth fade)
 *     < 0  → label is behind scene geometry (fully occluded)
 *   occlusion          := smoothstep(-fadeBand, +fadeBand, depthDiff)
 *
 * Final alpha:
 *   sampledAlpha * baseOpacity * occlusion
 */
export function createCrystalLabelMaterial(
  labelTexture: THREE.Texture,
): CrystalLabelMaterialHandles {
  const material = new THREE.MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.toneMapped = false;
  material.side = THREE.FrontSide;

  const baseOpacityUniform = uniform(1);

  material.colorNode = Fn(() => {
    const sampled = textureNode(labelTexture, uv());
    return sampled.rgb;
  })();

  material.opacityNode = Fn(() => {
    const sampled = textureNode(labelTexture, uv());
    const labelLinearDepth = linearDepth();
    const depthDiff = viewportLinearDepth.sub(labelLinearDepth);
    const fadeBand = float(LABEL_OCCLUSION_FADE_BAND);
    const occlusion = smoothstep(fadeBand.negate(), fadeBand, depthDiff);
    return sampled.a.mul(baseOpacityUniform).mul(occlusion);
  })();

  return { material, baseOpacityUniform };
}
