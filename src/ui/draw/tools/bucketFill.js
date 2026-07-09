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
import { colorDistance } from '../../../model/colorDistance.js';

// A null target/candidate (gradient fill or blank cell — see Canvas.colorAt)
// never matches a non-null one, at any tolerance: gradient shapes stay
// outside bucket fill's reach regardless of the tolerance setting, same as
// today's exact-match behavior.
function colorsMatch(candidate, target, tolerance) {
  if (candidate === target) return true;
  if (candidate === null || target === null) return false;
  return colorDistance(candidate, target) <= tolerance * tolerance;
}

function findMatchingRegion(ctx, x, y, target, width, height, tolerance) {
  const visited = new Uint8Array(width * height);
  const region = [];
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    const idx = cy * width + cx;
    if (visited[idx]) continue;
    visited[idx] = 1;
    if (!colorsMatch(ctx.colorAt(cx, cy), target, tolerance)) continue;
    region.push([cx, cy]);
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return region;
}

function findMatchingCanvas(ctx, target, width, height, tolerance) {
  const region = [];
  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      if (colorsMatch(ctx.colorAt(cx, cy), target, tolerance)) region.push([cx, cy]);
    }
  }
  return region;
}

export const bucketFillTool = {
  onPointerDown(ctx, x, y) {
    const target = ctx.colorAt(x, y);
    const newColor = resolvePaintColor(ctx);
    if (target === newColor) return;

    const tolerance = ctx.fillTolerance;
    const region = ctx.fillGlobal
      ? findMatchingCanvas(ctx, target, ctx.canvasWidth, ctx.canvasHeight, tolerance)
      : findMatchingRegion(ctx, x, y, target, ctx.canvasWidth, ctx.canvasHeight, tolerance);
    for (const [cx, cy] of region) ctx.paintCellLive(cx, cy, newColor);
    ctx.commitStroke();
  },
  onPointerMove() {},
  onPointerUp() {},
};
