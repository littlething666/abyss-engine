import { describe, expect, it } from 'vitest';
import {
  isSheetHeaderDragPassthroughTarget,
  shouldDismissSheetDrag,
  SHEET_HEADER_DRAG_DISTANCE_THRESHOLD,
  SHEET_HEADER_DRAG_MIN_DELTA,
  SHEET_HEADER_DRAG_VELOCITY_THRESHOLD,
} from './sheetHeaderDragDismiss';

describe('shouldDismissSheetDrag', () => {
  it('returns false when movement is below min delta', () => {
    expect(shouldDismissSheetDrag(SHEET_HEADER_DRAG_MIN_DELTA - 1, 10)).toBe(false);
  });

  it('returns true when distance crosses threshold with moderate velocity', () => {
    expect(shouldDismissSheetDrag(SHEET_HEADER_DRAG_DISTANCE_THRESHOLD, 0)).toBe(true);
  });

  it('returns true on fast flick below distance threshold', () => {
    expect(
      shouldDismissSheetDrag(
        40,
        SHEET_HEADER_DRAG_VELOCITY_THRESHOLD + 0.1,
        SHEET_HEADER_DRAG_DISTANCE_THRESHOLD,
        SHEET_HEADER_DRAG_VELOCITY_THRESHOLD,
        SHEET_HEADER_DRAG_MIN_DELTA,
      ),
    ).toBe(true);
  });

  it('returns false between min delta and thresholds with low velocity', () => {
    expect(
      shouldDismissSheetDrag(
        50,
        0.1,
        SHEET_HEADER_DRAG_DISTANCE_THRESHOLD,
        SHEET_HEADER_DRAG_VELOCITY_THRESHOLD,
        SHEET_HEADER_DRAG_MIN_DELTA,
      ),
    ).toBe(false);
  });
});

describe('isSheetHeaderDragPassthroughTarget', () => {
  it('returns false for null', () => {
    expect(isSheetHeaderDragPassthroughTarget(null)).toBe(false);
  });

  it('returns false for plain div', () => {
    const div = document.createElement('div');
    expect(isSheetHeaderDragPassthroughTarget(div)).toBe(false);
  });

  it('returns true for anchor with href', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com';
    expect(isSheetHeaderDragPassthroughTarget(a)).toBe(true);
  });

  it('returns true for text node inside a link', () => {
    const a = document.createElement('a');
    a.href = '/x';
    a.appendChild(document.createTextNode('link'));
    const text = a.firstChild as Text;
    expect(isSheetHeaderDragPassthroughTarget(text)).toBe(true);
  });

  it('returns true for button', () => {
    const b = document.createElement('button');
    expect(isSheetHeaderDragPassthroughTarget(b)).toBe(true);
  });

  it('returns true for input', () => {
    const input = document.createElement('input');
    expect(isSheetHeaderDragPassthroughTarget(input)).toBe(true);
  });

  it('returns true for element with role=button', () => {
    const d = document.createElement('div');
    d.setAttribute('role', 'button');
    expect(isSheetHeaderDragPassthroughTarget(d)).toBe(true);
  });

  it('returns true for contenteditable', () => {
    const d = document.createElement('div');
    d.setAttribute('contenteditable', 'true');
    expect(isSheetHeaderDragPassthroughTarget(d)).toBe(true);
  });
});
