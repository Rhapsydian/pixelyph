// Transforms a glyph's boolean grid (y-down, integer cells) into an
// opentype.js Path in font em-space (y-up, baseline at 0): fontX =
// gridX*scale + offsetX, fontY = (baselineRow - gridY)*scale.
//
// Winding rule: both CFF and TrueType glyph outlines fill under the
// nonzero winding rule, which only cares about nested contours winding in
// *opposite* directions from each other — not which absolute direction is
// "outer". Pixelloom already guarantees that (outer CW, holes CCW, in grid
// space); a uniform y-flip inverts both consistently, so the opposition is
// preserved and no per-contour reversal is needed. (Verified directly with
// a ray-casting winding-number check against a ring-shaped test glyph.)
//
// opentype.js only ever writes CFF-flavored OpenType output when building a
// font from scratch (verified empirically — there's no code path in the
// library that emits a TrueType `glyf` table for a programmatically
// constructed Font; `new Font(...).toArrayBuffer()` always produces an
// "OTTO"-signed CFF font), so a TrueType-specific winding convention isn't
// reachable with this library regardless.

import { gridToPath } from 'pixelloom';
import { pathToContours } from './pathToContours.js';
import { opentype } from './opentypeCompat.js';

/**
 * @param {{pixels:Uint8Array, width:number, height:number}} grid
 * @param {{scale:number, baselineRow:number, offsetX?:number}} options
 *   `scale` converts grid cells to font design units (typically
 *   unitsPerEm/pixelsPerEm); `offsetX` shifts the whole outline right by
 *   that many font units (left side bearing / icon tile padding).
 * @returns {opentype.Path}
 */
export function gridToGlyphPath(grid, { scale, baselineRow, offsetX = 0 }) {
  const d = gridToPath(grid.pixels, grid.width, grid.height);
  const contours = pathToContours(d);
  const path = new opentype.Path();

  for (const contour of contours) {
    if (contour.length === 0) continue;
    const points = contour.map(({ x, y }) => ({ x: x * scale + offsetX, y: (baselineRow - y) * scale }));
    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) path.lineTo(points[i].x, points[i].y);
    path.close();
  }

  return path;
}
