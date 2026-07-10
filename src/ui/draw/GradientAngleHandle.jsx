// On-canvas rotation handle for a Shape's linear-gradient angle — modeled
// on GradientEditorModal.jsx's StopBar pointer-capture mechanics (per-
// element setPointerCapture in onPointerDown, fresh getBoundingClientRect-
// derived point per move, e.buttons !== 1 gate), but lives inside the
// artwork <svg> (cell-unit coordinates) instead of an HTML modal, and uses
// a live/commit split (onDragAngle per move, onCommitAngle once on
// release) instead of StopBar's always-commit onChange — direct canvas-
// state edits can't afford a full undo snapshot per pointermove. Store-
// agnostic: only calls the two callback props, mirroring the separation
// SvgPixelEditor.jsx already keeps between paintCellLive and commitStroke.

import { useRef } from 'react';
import { gradientBoundsCanvasSpace, gradientBoundsCenter, gradientHandlePosition, angleFromHandleDrag } from './gradientHandleGeometry.js';

export function GradientAngleHandle({ grid, getCanvasPoint, onDragAngle, onCommitAngle }) {
  const draggingRef = useRef(false);
  const cancelledRef = useRef(false);
  const angleBeforeDragRef = useRef(0);

  const bounds = gradientBoundsCanvasSpace(grid);
  if (!bounds) return null; // fully empty shape — nothing to anchor the handle to yet

  const angle = grid.style.fill.angle ?? 0;
  const center = gradientBoundsCenter(bounds);
  const handlePos = gradientHandlePosition(bounds, angle);

  function endDrag() {
    draggingRef.current = false;
    window.removeEventListener('keydown', handleEscape);
  }
  function handleEscape(e) {
    if (e.key !== 'Escape' || !draggingRef.current) return;
    cancelledRef.current = true;
    onDragAngle(angleBeforeDragRef.current);
    endDrag();
  }
  function handlePointerDown(e) {
    e.stopPropagation(); // don't let the active paint tool also react to this click
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    cancelledRef.current = false;
    angleBeforeDragRef.current = angle;
    window.addEventListener('keydown', handleEscape);
  }
  function handlePointerMove(e) {
    if (!draggingRef.current) return;
    // Stop propagation for the whole gesture, not just pointerdown —
    // SvgPixelEditor's own handlePointerUp has no "was a drag actually in
    // progress" guard (unlike its handlePointerMove), so an unstopped
    // pointerup bubbling up from this handle gets misread as "the active
    // paint tool's gesture just ended" and fires a spurious extra commit.
    e.stopPropagation();
    if (e.buttons !== 1 || cancelledRef.current) return;
    const { px, py } = getCanvasPoint(e);
    onDragAngle(angleFromHandleDrag(bounds, px, py));
  }
  function handlePointerUp(e) {
    if (!draggingRef.current) return;
    e.stopPropagation();
    if (!cancelledRef.current) onCommitAngle(grid.style.fill.angle ?? 0);
    endDrag();
  }
  function handlePointerCancel(e) {
    if (!draggingRef.current) return;
    e.stopPropagation();
    onDragAngle(angleBeforeDragRef.current); // treat a lost pointer same as Escape — abort without commit
    endDrag();
  }

  return (
    <g>
      <line x1={center.x} y1={center.y} x2={handlePos.x} y2={handlePos.y} stroke="#4da3ff" strokeWidth={0.08} pointerEvents="none" />
      <circle
        cx={handlePos.x}
        cy={handlePos.y}
        r={0.5}
        fill="#ffffff"
        stroke="#4da3ff"
        strokeWidth={0.12}
        style={{ cursor: 'grab', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
    </g>
  );
}
