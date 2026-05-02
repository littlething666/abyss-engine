import * as THREE from 'three/webgpu';
import {
  Fn,
  texture as textureNode,
  uniform,
  uv,
} from 'three/tsl';
import { sharedDepthOcclusion } from './depthOcclusionNode';

export interface CrystalLabelMaterialHandles {
  material: THREE.MeshBasicNodeMaterial;
  baseOpacityUniform: ReturnType<typeof uniform>;
}

/**
 * Creates a billboard-ready MeshBasicNodeMaterial that samples a canvas-rasterized
 * label texture for color, and the viewport linear depth buffer for smooth
 * occlusion against any opaque geometry in the scene.
 *
 * Final alpha:
 *   sampledAlpha * baseOpacity * sharedDepthOcclusion()
 *
 * The depth-occlusion chain is shared with the mentor bubble materials via
 * `sharedDepthOcclusion()`, so labels and the mentor bubble fade identically
 * against scene geometry.
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
    return sampled.a.mul(baseOpacityUniform).mul(sharedDepthOcclusion());
  })();

  return { material, baseOpacityUniform };
}
