// Generic pointer-lifecycle hook for an on-canvas gradient drag handle —
// extracted from GradientAngleHandle.jsx's pattern (per-handle
// setPointerCapture, drag/cancelled refs, Escape-to-revert,
// pointercancel-as-Escape, and e.stopPropagation() on every pointer event
// type, not just pointerdown — SvgPixelEditor's own handlePointerUp has no
// in-progress-drag guard and will misfire a spurious extra undo commit on
// any unstopped bubbled pointerup, see the ef09c5a fix). GradientAngleHandle
// itself is left as-is, not migrated onto this hook.
//
// `computeValue`/`currentValue`/`onDrag`/`onCommit` are read fresh on every
// call (this is a plain closure-capturing hook, not memoized), so callers
// don't need refs to avoid staleness — matching how the original component
// read `grid.style.fill.angle` fresh from props each render.

import { useRef } from 'react';

/**
 * @param {object} params
 * @param {*} params.currentValue value to revert to on Escape/pointercancel
 * @param {(e: PointerEvent) => *} params.computeValue derive a new value from a pointermove event
 * @param {(value: *) => void} params.onDrag called with a live (uncommitted) value during drag/revert
 * @param {() => void} params.onCommit called once, with no args, when the drag ends without cancellation — the caller reads the current live value itself
 */
export function useGradientDragHandle({ currentValue, computeValue, onDrag, onCommit }) {
  const draggingRef = useRef(false);
  const cancelledRef = useRef(false);
  const valueBeforeDragRef = useRef(currentValue);

  function endDrag() {
    draggingRef.current = false;
    window.removeEventListener('keydown', handleEscape);
  }
  function handleEscape(e) {
    if (e.key !== 'Escape' || !draggingRef.current) return;
    cancelledRef.current = true;
    onDrag(valueBeforeDragRef.current);
    endDrag();
  }
  function handlePointerDown(e) {
    e.stopPropagation(); // don't let the active paint tool also react to this click
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    cancelledRef.current = false;
    valueBeforeDragRef.current = currentValue;
    window.addEventListener('keydown', handleEscape);
  }
  function handlePointerMove(e) {
    if (!draggingRef.current) return;
    e.stopPropagation();
    if (e.buttons !== 1 || cancelledRef.current) return;
    onDrag(computeValue(e));
  }
  function handlePointerUp(e) {
    if (!draggingRef.current) return;
    e.stopPropagation();
    if (!cancelledRef.current) onCommit();
    endDrag();
  }
  function handlePointerCancel(e) {
    if (!draggingRef.current) return;
    e.stopPropagation();
    onDrag(valueBeforeDragRef.current); // treat a lost pointer same as Escape — abort without commit
    endDrag();
  }

  return { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel };
}
