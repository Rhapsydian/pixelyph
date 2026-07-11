// On-canvas free-draggable start/end points for a linear gradient in
// Endpoints mode — two GradientPointHandles plus a connecting guide line,
// mirroring GradientAngleHandle.jsx's grid/getCanvasPoint/live-commit-split
// prop shape so SvgPixelEditor.jsx's wiring stays consistent across handle
// kinds.

import { gradientBoundsCanvasSpace, fractionToCanvasPoint } from './gradientHandleGeometry.js';
import { GradientPointHandle } from './GradientPointHandle.jsx';

export function GradientLinearEndpointsHandle({ grid, getCanvasPoint, onDragStart, onCommitStart, onDragEnd, onCommitEnd }) {
  const bounds = gradientBoundsCanvasSpace(grid);
  if (!bounds) return null; // fully empty shape — nothing to anchor the handles to yet

  const fill = grid.style.fill;
  const p1 = fractionToCanvasPoint(bounds, fill.x1, fill.y1);
  const p2 = fractionToCanvasPoint(bounds, fill.x2, fill.y2);

  return (
    <g>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#4da3ff" strokeWidth={0.08} pointerEvents="none" />
      <GradientPointHandle
        bounds={bounds}
        getCanvasPoint={getCanvasPoint}
        fx={fill.x1}
        fy={fill.y1}
        onDrag={({ fx, fy }) => onDragStart({ x1: fx, y1: fy })}
        onCommit={() => onCommitStart({ x1: grid.style.fill.x1, y1: grid.style.fill.y1 })}
      />
      <GradientPointHandle
        bounds={bounds}
        getCanvasPoint={getCanvasPoint}
        fx={fill.x2}
        fy={fill.y2}
        onDrag={({ fx, fy }) => onDragEnd({ x2: fx, y2: fy })}
        onCommit={() => onCommitEnd({ x2: grid.style.fill.x2, y2: grid.style.fill.y2 })}
      />
    </g>
  );
}
