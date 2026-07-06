// Flood fill reads the same composited color (Canvas.colorAt) bucket fill
// shares with the eyedropper. The region is found first in a read-only
// pass, then painted in a separate pass — not interleaved — because
// painting through paintCellLive also writes each cell's mirror twin when
// symmetry is on, and those mirrored writes would otherwise land on
// not-yet-visited cells mid-BFS, corrupting the target-color match there
// and cutting the flood-fill off early at the mirror axis.
//
// Right-click (ctx.erasing) fills the matching region with null instead of
// the active color, clearing it in one action rather than painting it.

import { resolvePaintColor } from './toolColor.js';

function findMatchingRegion(ctx, x, y, target, width, height) {
  const visited = new Uint8Array(width * height);
  const region = [];
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    const idx = cy * width + cx;
    if (visited[idx]) continue;
    visited[idx] = 1;
    if (ctx.colorAt(cx, cy) !== target) continue;
    region.push([cx, cy]);
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return region;
}

export const bucketFillTool = {
  onPointerDown(ctx, x, y) {
    const target = ctx.colorAt(x, y);
    const newColor = resolvePaintColor(ctx);
    if (target === newColor) return;

    const region = findMatchingRegion(ctx, x, y, target, ctx.canvasWidth, ctx.canvasHeight);
    for (const [cx, cy] of region) ctx.paintCellLive(cx, cy, newColor);
    ctx.commitStroke();
  },
  onPointerMove() {},
  onPointerUp() {},
};
