// One generic draggable on-canvas point (fx,fy in 0-1 objectBoundingBox
// fraction space), shared by every point-style gradient handle: radial
// center, each linear endpoint, and (with the diamond shape + a clamp) the
// radial focal point.

import { useGradientDragHandle } from './useGradientDragHandle.js';
import { fractionToCanvasPoint, canvasPointToFraction } from './gradientHandleGeometry.js';

/**
 * @param {object} props
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} props.bounds
 * @param {(e: PointerEvent) => {px:number,py:number}} props.getCanvasPoint
 * @param {number} props.fx
 * @param {number} props.fy
 * @param {'circle'|'diamond'} [props.shape]
 * @param {(fx:number, fy:number) => {fx:number,fy:number}} [props.clamp] optional post-drag clamp (e.g. focal point kept within the radius)
 * @param {({fx,fy}: {fx:number,fy:number}) => void} props.onDrag
 * @param {() => void} props.onCommit
 */
export function GradientPointHandle({ bounds, getCanvasPoint, fx, fy, shape = 'circle', clamp, onDrag, onCommit }) {
  const point = fractionToCanvasPoint(bounds, fx, fy);

  const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useGradientDragHandle({
    currentValue: { fx, fy },
    computeValue: (e) => {
      const { px, py } = getCanvasPoint(e);
      const next = canvasPointToFraction(bounds, px, py);
      return clamp ? clamp(next.fx, next.fy) : next;
    },
    onDrag,
    onCommit,
  });

  const commonProps = {
    fill: '#ffffff',
    stroke: '#4da3ff',
    strokeWidth: 0.12,
    style: { cursor: 'grab', touchAction: 'none' },
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
  };

  if (shape === 'diamond') {
    const r = 0.45;
    const points = `${point.x},${point.y - r} ${point.x + r},${point.y} ${point.x},${point.y + r} ${point.x - r},${point.y}`;
    return <polygon points={points} {...commonProps} />;
  }
  return <circle cx={point.x} cy={point.y} r={0.5} {...commonProps} />;
}
