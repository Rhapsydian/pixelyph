// On-canvas center + radius drag handles for a radial gradient. Composes
// GradientPointHandle (center) + GradientRadiusHandle (radius) + a
// connecting spoke line — mirrors GradientAngleHandle.jsx/
// GradientLinearEndpointsHandle.jsx's grid/getCanvasPoint/live-commit-split
// prop shape. The focal-point handle (Checkpoint 5) will be added here
// alongside these two.

import { gradientBoundsCanvasSpace, fractionToCanvasPoint, radialEdgeCanvasPosition } from './gradientHandleGeometry.js';
import { GradientPointHandle } from './GradientPointHandle.jsx';
import { GradientRadiusHandle } from './GradientRadiusHandle.jsx';

export function GradientRadialHandle({ grid, getCanvasPoint, onDragCenter, onCommitCenter, onDragRadius, onCommitRadius }) {
  const bounds = gradientBoundsCanvasSpace(grid);
  if (!bounds) return null; // fully empty shape — nothing to anchor the handles to yet

  const fill = grid.style.fill;
  const center = fractionToCanvasPoint(bounds, fill.cx, fill.cy);
  const edge = radialEdgeCanvasPosition(bounds, fill.cx, fill.cy, fill.r);

  return (
    <g>
      <line x1={center.x} y1={center.y} x2={edge.x} y2={edge.y} stroke="#4da3ff" strokeWidth={0.08} pointerEvents="none" />
      <GradientRadiusHandle
        bounds={bounds}
        getCanvasPoint={getCanvasPoint}
        cx={fill.cx}
        cy={fill.cy}
        r={fill.r}
        onDrag={(r) => onDragRadius(r)}
        onCommit={() => onCommitRadius(grid.style.fill.r)}
      />
      <GradientPointHandle
        bounds={bounds}
        getCanvasPoint={getCanvasPoint}
        fx={fill.cx}
        fy={fill.cy}
        onDrag={({ fx, fy }) => onDragCenter({ cx: fx, cy: fy })}
        onCommit={() => onCommitCenter({ cx: grid.style.fill.cx, cy: grid.style.fill.cy })}
      />
    </g>
  );
}
