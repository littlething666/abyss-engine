/** Pixels dragged downward before dismiss (unless velocity triggers first). */
export const SHEET_HEADER_DRAG_DISTANCE_THRESHOLD = 70;

/** Downward velocity in px/ms; fast flicks dismiss below distance threshold. */
export const SHEET_HEADER_DRAG_VELOCITY_THRESHOLD = 0.45;

/** Ignore dismiss if the user barely moved (noise / tap). */
export const SHEET_HEADER_DRAG_MIN_DELTA = 10;

/** Interactive elements: sheet drag should not capture so taps/clicks behave normally. */
const SHEET_HEADER_DRAG_PASSTHROUGH_SELECTOR =
  'a[href],button,input,textarea,select,[role="button"],[contenteditable="true"]';

function elementFromPointerTarget(target: EventTarget | null): Element | null {
  if (target === null) return null;
  if (target instanceof Element) return target;
  if (target instanceof Text) return target.parentElement;
  return null;
}

/** True when `pointerdown` target is (inside) an interactive control; skip drag start. */
export function isSheetHeaderDragPassthroughTarget(target: EventTarget | null): boolean {
  const el = elementFromPointerTarget(target);
  if (!el) return false;
  return el.closest(SHEET_HEADER_DRAG_PASSTHROUGH_SELECTOR) !== null;
}

export function shouldDismissSheetDrag(
  deltaY: number,
  velocityYPxPerMs: number,
  distanceThreshold: number = SHEET_HEADER_DRAG_DISTANCE_THRESHOLD,
  velocityThreshold: number = SHEET_HEADER_DRAG_VELOCITY_THRESHOLD,
  minDelta: number = SHEET_HEADER_DRAG_MIN_DELTA,
): boolean {
  if (deltaY < minDelta) return false;
  return deltaY >= distanceThreshold || velocityYPxPerMs >= velocityThreshold;
}
