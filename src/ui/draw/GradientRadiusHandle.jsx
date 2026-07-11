// One draggable radius-edge circle for a radial gradient, relative to a
// fixed center — dragging moves it along its fixed horizontal spoke only
// (see gradientHandleGeometry.js's radialEdgeCanvasPosition/
// radialRadiusFromDrag), built on the shared drag-handle hook.

import { useGradientDragHandle } from './useGradientDragHandle.js';
import { radialEdgeCanvasPosition, radialRadiusFromDrag } from './gradientHandleGeometry.js';

/**
 * @param {object} props
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} props.bounds
 * @param {(e: PointerEvent) => {px:number,py:number}} props.getCanvasPoint
 * @param {number} props.cx center x, 0-1 fraction
 * @param {number} props.cy center y, 0-1 fraction
 * @param {number} props.r radius, 0-1 fraction
 * @param {(r:number) => void} props.onDrag
 * @param {() => void} props.onCommit
 */
export function GradientRadiusHandle({ bounds, getCanvasPoint, cx, cy, r, onDrag, onCommit }) {
  const point = radialEdgeCanvasPosition(bounds, cx, cy, r);

  const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useGradientDragHandle({
    currentValue: r,
    computeValue: (e) => {
      const { px } = getCanvasPoint(e);
      return radialRadiusFromDrag(bounds, px, cx);
    },
    onDrag,
    onCommit,
  });

  return (
    <circle
      cx={point.x}
      cy={point.y}
      r={0.5}
      fill="#ffffff"
      stroke="#4da3ff"
      strokeWidth={0.12}
      style={{ cursor: 'ew-resize', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    />
  );
}
