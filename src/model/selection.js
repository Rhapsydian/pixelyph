// Pure extract/clear/paste helpers backing the marquee tool's move/copy/
// paste flow. Selection state itself (the drag rect, the floating buffer)
// is transient UI state that lives in state/store.js, not here — this file
// only touches Canvas data, via the same colorAt/paintCell every other
// tool uses, so a multi-color move re-runs autoLayerSync bookkeeping
// exactly like a normal stroke would (simple tier).
//
// Advanced tier has two selection scopes (state/store.js's `selectionScope`
// picks between them): "all visible layers" (extractRectColors, same
// topmost-wins read as colorAt/the eyedropper) or "active layer only"
// (extractRectFromActiveLayer, ignoring everything else regardless of
// what's on top). Clearing has to match whichever scope did the reading —
// clearRect only ever erases the active layer (fine for the active-layer
// scope, and for simple tier's auto-layer-aware erase), but a multi-layer
// selection needs clearRectAllLayers so each cell's *own* source layer gets
// cleared, not just whatever happens to be active. Either way, paste always
// lands on the active layer (see pasteCells) — a multi-layer selection
// flattens onto it on drop, it doesn't reconstruct the original layers.

import { colorAt, paintCell, topVisibleLayerAt, eraseFromLayer, topGridAt } from './Canvas.js';
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
 * Clears every cell in `rect` from *whichever layer actually owns it*
 * (topmost visible, same as extractRectColors's read) rather than only the
 * active layer — the destructive half of an "all visible layers" scoped
 * move/cut, so a multi-layer selection doesn't leave orphaned content
 * behind on the layers it didn't happen to be active on.
 *
 * @param {object} canvas
 * @param {{x0:number,y0:number,x1:number,y1:number}} rect
 */
export function clearRectAllLayers(canvas, rect) {
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const layer = topVisibleLayerAt(canvas, x, y);
      if (layer) eraseFromLayer(canvas, layer, x, y);
    }
  }
}

/** Paints `cells` (as produced by extractRectColors) back in at (originX, originY). */
export function pasteCells(canvas, originX, originY, cells) {
  for (const cell of cells) paintCell(canvas, originX + cell.dx, originY + cell.dy, cell.color);
}
