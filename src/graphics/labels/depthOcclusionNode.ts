import {
  float,
  linearDepth,
  smoothstep,
  viewportLinearDepth,
} from 'three/tsl';
import { LABEL_OCCLUSION_FADE_BAND } from './crystalLabelConstants';

/**
 * Shared depth-aware occlusion factor used by both crystal labels and the
 * mentor bubble glyph + halo. Returns a TSL node in `[0, 1]` where:
 *   - 1.0 means the surface is in front of any opaque scene geometry,
 *   - 0.0 means it is fully occluded,
 *   - smooth fade across `LABEL_OCCLUSION_FADE_BAND` at silhouette edges.
 *
 * Pipeline:
 *   surfaceLinearDepth := linearDepth()
 *   sceneLinearDepth   := viewportLinearDepth
 *   depthDiff          := sceneLinearDepth - surfaceLinearDepth
 *     > 0 -> nothing in front (visible)
 *     ~ 0 -> silhouette edge (smooth fade)
 *     < 0 -> behind scene geometry (occluded)
 *   occlusion          := smoothstep(-fadeBand, +fadeBand, depthDiff)
 *
 * Always invoke from inside an `Fn(() => ...)` material-node callback so
 * the resulting node is captured by the surrounding shader compilation.
 */
export function sharedDepthOcclusion() {
  const surfaceLinearDepth = linearDepth();
  const depthDiff = viewportLinearDepth.sub(surfaceLinearDepth);
  const fadeBand = float(LABEL_OCCLUSION_FADE_BAND);
  return smoothstep(fadeBand.negate(), fadeBand, depthDiff);
}
