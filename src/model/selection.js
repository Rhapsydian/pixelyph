// Pure extract/clear/paste helpers backing the marquee tool's move/copy/
// paste flow. Selection state itself (the drag rect, the floating buffer)
// is transient UI state that lives in state/store.js, not here — this file
// only touches Canvas data, via the same colorAt/paintCell every other
// tool uses, so a multi-color move re-runs autoLayerSync bookkeeping
// exactly like a normal stroke would (simple tier).
//
// Advanced tier has two selection scopes (state/store.js's `selectionScope`
// picks between them): "active shape" (extractRectFromActiveGrid, just
// `canvas.activeGridId`) or "active layer" (extractRectFromActiveLayer,
// topmost-wins within that one layer only, ignoring every other layer
// regardless of what's on top). Simple tier and Glyph mode always use
// extractRectColors/clearRect instead — not a scope choice, just how those
// tiers work (topmost-wins across all layers, since their per-color grids
// are auto-managed and invisible to the user as separate objects). Paste
// always lands on the active layer (see pasteCells).

import { colorAt, paintCell, eraseFromLayer, topGridAt, currentFrameIndex } from './Canvas.js';
import { get } from './Grid.js';

/** Used as a floating-selection preview color when a cell's source layer has a non-solid (gradient) fill, which can't be represented per-cell. */
const NON_SOLID_FILL_PREVIEW_COLOR = '#888888';

/** @returns {{x0:number,y0:number,x1:number,y1:number}} */
export function normalizeRect(x0, y0, x1, y1) {
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}

/**
 * Reads the composited color at every cell in `rect` (canvas-space,
 * inclusive). Empty cells are omitted rather than recorded as null, since
 * pasteCells's paintCell(..., null) would otherwise erase the destination
 * even where the source had nothing.
 *
 * @param {object} canvas
 * @param {{x0:number,y0:number,x1:number,y1:number}} rect
 * @returns {{dx:number,dy:number,color:string}[]} positions relative to rect's top-left
 */
export function extractRectColors(canvas, rect) {
  const cells = [];
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const color = colorAt(canvas, x, y);
      if (color) cells.push({ dx: x - rect.x0, dy: y - rect.y0, color });
    }
  }
  return cells;
}

/**
 * Reads only `canvas.activeLayerId`'s own cells in `rect`, ignoring every
 * other layer — even one stacked visibly on top. The advanced-tier
 * "active layer" selection scope, for isolating one layer's shapes when
 * others happen to overlap it. Within the active layer, the topmost visible
 * shape owning each cell wins (a layer can hold more than one shape — see
 * docs/data-model.md), same as colorAt's per-layer scan.
 *
 * @param {object} canvas
 * @param {{x0:number,y0:number,x1:number,y1:number}} rect
 * @returns {{dx:number,dy:number,color:string}[]}
 */
export function extractRectFromActiveLayer(canvas, rect) {
  const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
  if (!layer) return [];
  const frame = layer.frames[Math.max(0, Math.min(canvas.activeFrame ?? 0, layer.frames.length - 1))];
  const cells = [];
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const grid = topGridAt(frame, x, y);
      if (!grid) continue;
      const color = typeof grid.style.fill === 'string' ? grid.style.fill : NON_SOLID_FILL_PREVIEW_COLOR;
      cells.push({ dx: x - rect.x0, dy: y - rect.y0, color });
    }
  }
  return cells;
}

/**
 * Reads only the active Grid's (Shape's) own cells in `rect` — the
 * narrowest advanced-tier selection scope, isolating one shape even when a
 * different shape in the *same* layer (or stacked elsewhere) overlaps it. A
 * cell counts only if this exact grid (by id) has a pixel set there;
 * contrast with extractRectFromActiveLayer's topGridAt-wins scan across
 * every shape in the layer.
 *
 * @param {object} canvas
 * @param {{x0:number,y0:number,x1:number,y1:number}} rect
 * @returns {{dx:number,dy:number,color:string}[]}
 */
export function extractRectFromActiveGrid(canvas, rect) {
  const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
  if (!layer) return [];
  const frame = layer.frames[Math.max(0, Math.min(canvas.activeFrame ?? 0, layer.frames.length - 1))];
  const grid = frame.grids.find((g) => g.id === canvas.activeGridId);
  if (!grid) return [];
  const color = typeof grid.style.fill === 'string' ? grid.style.fill : NON_SOLID_FILL_PREVIEW_COLOR;
  const cells = [];
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!get(grid, x - grid.offsetX, y - grid.offsetY)) continue;
      cells.push({ dx: x - rect.x0, dy: y - rect.y0, color });
    }
  }
  return cells;
}

/** Clears every cell in `rect` from the active layer only — the destructive half of a "move" lift. */
export function clearRect(canvas, rect) {
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) paintCell(canvas, x, y, null);
  }
}

/**
 * Clears every cell in `rect` from *whichever shape within the active
 * layer* actually owns it (topmost within that layer, same read as
 * extractRectFromActiveLayer) — the destructive half of an "active layer"
 * scoped move/cut. Plain `clearRect` only ever erases from
 * `canvas.activeGridId` (one shape); when the active layer holds more than
 * one shape (advanced tier — see docs/data-model.md), a selection can span
 * several of that layer's shapes at once, and `clearRect` would leave the
 * non-active ones behind un-cleared even though `extractRectFromActiveLayer`
 * already included their cells — a source/extraction mismatch that leaves
 * the un-cleared shape duplicated once the lifted copy is later dropped.
 *
 * @param {object} canvas
 * @param {{x0:number,y0:number,x1:number,y1:number}} rect
 */
export function clearRectFromActiveLayer(canvas, rect) {
  const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
  if (!layer) return;
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) eraseFromLayer(canvas, layer, x, y);
  }
}

/**
 * Paints `cells` (as produced by extractRectColors/extractRectFromActiveLayer/
 * extractRectFromActiveGrid) back in at (originX, originY).
 *
 * Pixel tier's `paintCell` already resolves one Grid per distinct color via
 * `paintSimpleCell`, so a plain per-cell loop is correct there. Advanced
 * tier's `paintCell` instead always targets a single fixed
 * `canvas.activeGridId` — right for a single-shape paste (`activeShape`
 * scope, always monochrome by construction) but wrong for a multi-color one
 * (`activeLayer` scope extracts can span several differently-styled
 * shapes): every color after the first would silently
 * collapse into that one grid, adopting its style and losing its own.
 * Group by color and give each group its own paint target: the color
 * matching whatever was originally active reuses that grid (preserving its
 * identity/style), every other color always gets a fresh grid — never
 * merged into an unrelated same-colored shape, which would be its own kind
 * of silent data loss.
 *
 * @param {object} canvas
 * @param {number} originX
 * @param {number} originY
 * @param {{dx:number,dy:number,color:string}[]} cells
 */
export function pasteCells(canvas, originX, originY, cells) {
  if (canvas.tier !== 'advanced') {
    for (const cell of cells) paintCell(canvas, originX + cell.dx, originY + cell.dy, cell.color);
    return;
  }
  const byColor = new Map();
  for (const cell of cells) {
    if (!byColor.has(cell.color)) byColor.set(cell.color, []);
    byColor.get(cell.color).push(cell);
  }
  const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
  const frame = layer?.frames[currentFrameIndex(canvas)];
  const originalGrid = frame?.grids.find((g) => g.id === canvas.activeGridId);
  for (const [color, groupCells] of byColor) {
    canvas.activeGridId = originalGrid && originalGrid.style.fill === color ? originalGrid.id : null;
    for (const cell of groupCells) paintCell(canvas, originX + cell.dx, originY + cell.dy, cell.color);
  }
}

/**
 * Flips/rotates a floating selection's sparse `{dx,dy,color}[]` cell list in
 * place around its own `width x height` bounds — the Transform menu's
 * Selection scope. `floatingSelection.cells` isn't a dense raster, so this
 * remaps points directly rather than round-tripping through Grid.js's
 * byte-typed buffer helpers (which can't hold color strings). Remap math
 * matches Grid.js's flipPixelsH/flipPixelsV/rotatePixels90 exactly, just
 * expressed as a forward point transform instead of an index lookup.
 *
 * @param {number} width
 * @param {number} height
 * @param {{dx:number,dy:number,color:string}[]} cells
 * @param {'flipH'|'flipV'|'rotate90'} kind
 * @returns {{dx:number,dy:number,color:string}[]} `rotate90` output is sized `height x width` (swapped)
 */
export function transformSelectionCells(width, height, cells, kind) {
  return cells.map((cell) => {
    if (kind === 'flipH') return { ...cell, dx: width - 1 - cell.dx };
    if (kind === 'flipV') return { ...cell, dy: height - 1 - cell.dy };
    // rotate90 (90° CW, matching rotatePixels90's direction)
    return { ...cell, dx: height - 1 - cell.dy, dy: cell.dx };
  });
}
