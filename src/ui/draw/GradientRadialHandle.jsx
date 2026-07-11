// On-canvas center + radius + focal-point drag handles for a radial
// gradient. Composes GradientPointHandle (center, circle) +
// GradientRadiusHandle (radius) + GradientPointHandle (focal, diamond,
// clamped to stay within the current radius) + connecting spoke line —
// mirrors GradientAngleHandle.jsx/GradientLinearEndpointsHandle.jsx's
// grid/getCanvasPoint/live-commit-split prop shape.

import {
  gradientBoundsCanvasSpace,
  fractionToCanvasPoint,
  radialEdgeCanvasPosition,
  clampPointToRadius,
  translateFocalPoint,
  rescaleFocalPoint,
} from './gradientHandleGeometry.js';
import { GradientPointHandle } from './GradientPointHandle.jsx';
import { GradientRadiusHandle } from './GradientRadiusHandle.jsx';

export function GradientRadialHandle({ grid, getCanvasPoint, onDragCenter, onCommitCenter, onDragRadius, onCommitRadius, onDragFocal, onCommitFocal }) {
  const bounds = gradientBoundsCanvasSpace(grid);
  if (!bounds) return null; // fully empty shape — nothing to anchor the handles to yet

  const fill = grid.style.fill;
  const center = fractionToCanvasPoint(bounds, fill.cx, fill.cy);
  const edge = radialEdgeCanvasPosition(bounds, fill.cx, fill.cy, fill.r);
  const focalFx = fill.fx ?? fill.cx;
  const focalFy = fill.fy ?? fill.cy;

  return (
    <g>
      <line x1={center.x} y1={center.y} x2={edge.x} y2={edge.y} stroke="#4da3ff" strokeWidth={0.08} pointerEvents="none" />
      <GradientRadiusHandle
        bounds={bounds}
        getCanvasPoint={getCanvasPoint}
        cx={fill.cx}
        cy={fill.cy}
        r={fill.r}
        onDrag={(r) => onDragRadius({ r, ...rescaleFocalPoint(fill, r) })}
        onCommit={() => {
          const f = grid.style.fill;
          onCommitRadius({ r: f.r, fx: f.fx, fy: f.fy });
        }}
      />
      <GradientPointHandle
        bounds={bounds}
        getCanvasPoint={getCanvasPoint}
        fx={fill.cx}
        fy={fill.cy}
        onDrag={({ fx, fy }) => onDragCenter({ cx: fx, cy: fy, ...translateFocalPoint(fill, fx, fy) })}
        onCommit={() => {
          const f = grid.style.fill;
          onCommitCenter({ cx: f.cx, cy: f.cy, fx: f.fx, fy: f.fy });
        }}
      />
      {/* Rendered last (on top) so it stays independently grabbable even when it starts
          coincident with the (larger) center handle — the diamond's corners sit strictly
          inside the center circle's radius, so paint order is what makes it clickable. */}
      <GradientPointHandle
        bounds={bounds}
        getCanvasPoint={getCanvasPoint}
        fx={focalFx}
        fy={focalFy}
        shape="diamond"
        clamp={(fx, fy) => clampPointToRadius(fill.cx, fill.cy, fill.r, fx, fy)}
        onDrag={({ fx, fy }) => onDragFocal({ fx, fy })}
        onCommit={() => {
          const f = grid.style.fill;
          onCommitFocal({ fx: f.fx ?? f.cx, fy: f.fy ?? f.cy });
        }}
      />
    </g>
  );
}
