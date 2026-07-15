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
import { get, set, transformGridRegion, growGridToInclude, shrinkGridToFit, minimalBounds, makeGridId, collapseToEmptyGrid } from './Grid.js';

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

// --- floatingGridSelection: Shape tier's style-preserving analog of
// floatingSelection, above. Where floatingSelection is a sparse
// {dx,dy,color}[] (fine for Pixel tier/Glyph mode, which have no per-shape
// style to lose), a floatingGridSelection is a set of real, detached
// Grid-shaped clones — each keeps its own style/gradient/stroke intact and
// its own identity (`originGridId`), so Move and Transform (flip/rotate)
// can be applied to it, any number of times in any order, exactly like
// floatingSelection already supports, before one Finalize/Cancel. Nothing
// in `canvas.layers` is ever mutated until finalizeGridSelection actually
// runs — Cancel is therefore a true no-op, not a history revert.
//
// Shape: { layerId, rect: {x0,y0,x1,y1}, clones: [{ originGridId, originSnapshot, grid }] }
// - `rect` is the selection's current bounding rect — the shared pivot
//   frame every Transform op uses (matches transformGridRegion's existing,
//   already-tested "flip within rect, not within each shape's own bounds"
//   convention), translated in lockstep by every Move.
// - `grid` is a real Grid-shaped object (id/offsetX/offsetY/width/height/
//   pixels/style/opacity/visible/locked) — what's rendered, and what
//   Move/Transform mutate in place.
// - `originGridId`/`originSnapshot` (both null for copy-drag or external
//   paste) record which real grid this clone will write back into on
//   finalize, and exactly which of that grid's cells to clear first —
//   frozen at lift time, never touched by Move/Transform.

/**
 * Crops one Grid's own cells inside `rect` into a standalone clone
 * (offsetX/offsetY/width/height/pixels tight around just the overlap) —
 * the per-shape "cut" half of the cut/transform/paste model. Returns null
 * if this grid has no pixels inside `rect` at all (nothing to lift).
 */
function cropGridToRect(grid, rect) {
  const x0 = Math.max(rect.x0, grid.offsetX);
  const x1 = Math.min(rect.x1, grid.offsetX + grid.width - 1);
  const y0 = Math.max(rect.y0, grid.offsetY);
  const y1 = Math.min(rect.y1, grid.offsetY + grid.height - 1);
  if (x0 > x1 || y0 > y1) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const cells = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!get(grid, x - grid.offsetX, y - grid.offsetY)) continue;
      cells.push([x, y]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (cells.length === 0) return null;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const pixels = new Uint8Array(width * height);
  for (const [x, y] of cells) pixels[(y - minY) * width + (x - minX)] = 1;
  return { offsetX: minX, offsetY: minY, width, height, pixels };
}

/**
 * Lifts `selectionScope`'s in-play Grids' cells inside `rect` into a new
 * floatingGridSelection — Shape tier's entry point for marquee drag-move,
 * Copy, and Transform > Selection alike. Locked and hidden shapes (and a
 * hidden frame) are fully excluded, for every scope including
 * `activeShape` — the lock/hidden immunity now applies uniformly, unlike
 * the old per-function-inconsistent flat-cell path this replaces.
 *
 * `destructive: false` (Copy, or a shift-drag) strips every clone's
 * `originGridId`/`originSnapshot` — finalize will insert fresh grids
 * instead of writing back into the source, so the original is never
 * touched even after finalize.
 *
 * Nothing here mutates `canvas` — purely a read. The clear happens later,
 * at finalize (or, for Cut, via clearGridSelectionSource directly).
 *
 * @param {object} canvas
 * @param {'activeShape'|'activeLayer'} selectionScope
 * @param {{x0:number,y0:number,x1:number,y1:number}} rect
 * @param {boolean} [destructive]
 * @returns {{layerId:string, rect:object, clones:object[]}|null}
 */
export function liftGridSelection(canvas, selectionScope, rect, destructive = true) {
  const frameIndex = currentFrameIndex(canvas);
  const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
  const frame = layer?.frames[frameIndex];
  if (!frame || !frame.visible) return null;
  const candidates = selectionScope === 'activeShape' ? frame.grids.filter((g) => g.id === canvas.activeGridId) : frame.grids;
  const eligible = candidates.filter((g) => g.visible && !g.locked);
  const clones = [];
  for (const grid of eligible) {
    const region = cropGridToRect(grid, rect);
    if (!region) continue;
    clones.push({
      originGridId: destructive ? grid.id : null,
      originSnapshot: destructive ? { offsetX: region.offsetX, offsetY: region.offsetY, width: region.width, height: region.height, pixels: region.pixels.slice() } : null,
      grid: {
        id: destructive ? grid.id : makeGridId(),
        name: grid.name,
        offsetX: region.offsetX,
        offsetY: region.offsetY,
        width: region.width,
        height: region.height,
        pixels: region.pixels,
        style: grid.style,
        opacity: grid.opacity,
        visible: true,
        locked: false,
      },
    });
  }
  if (clones.length === 0) return null;
  return { layerId: layer.id, rect: { ...rect }, clones };
}

/** Translates a floatingGridSelection's rect and every clone's grid by (dx, dy), in place — the Move half of cut/transform/paste. */
export function moveGridSelectionBy(fgs, dx, dy) {
  fgs.rect = { x0: fgs.rect.x0 + dx, y0: fgs.rect.y0 + dy, x1: fgs.rect.x1 + dx, y1: fgs.rect.y1 + dy };
  for (const clone of fgs.clones) {
    clone.grid.offsetX += dx;
    clone.grid.offsetY += dy;
  }
}

/**
 * Flips/rotates every clone's grid within the floatingGridSelection's
 * current `rect` (transformGridRegion, reused directly — same shared-pivot
 * convention already verified for the pre-redesign instant-commit path) —
 * the Transform half of cut/transform/paste. Composable with Move and with
 * itself: calling this again just transforms whatever's currently pending,
 * around the same tracked rect (swapped for a 90° rotate, matching
 * transformSelectionInStore's existing multi-rotate rect bookkeeping).
 */
export function transformGridSelection(fgs, kind) {
  for (const clone of fgs.clones) transformGridRegion(clone.grid, fgs.rect, kind);
  if (kind === 'rotate90') {
    const { x0, y0, x1, y1 } = fgs.rect;
    const width = x1 - x0 + 1;
    const height = y1 - y0 + 1;
    fgs.rect = { x0, y0, x1: x0 + height - 1, y1: y0 + width - 1 };
  }
}

/**
 * Clears each destructively-lifted clone's *original* cells (per
 * `originSnapshot`, frozen at lift time — never the clone's current,
 * possibly-moved/transformed position) from its real source grid, via
 * `set` directly rather than `paintCell`/`eraseFromLayer` — deliberately
 * skips their auto-delete-when-emptied side effect, since finalize always
 * repaints this same grid object right back in the very next step; nothing
 * should observe it as briefly empty. Cut (which never repaints) calls
 * `pruneEmptyGridsForSelection` afterward itself. Copy-sourced clones
 * (`originGridId: null`) are skipped — there's nothing to clear.
 */
export function clearGridSelectionSource(canvas, fgs) {
  const frameIndex = currentFrameIndex(canvas);
  const layer = canvas.layers.find((l) => l.id === fgs.layerId);
  const frame = layer?.frames[frameIndex];
  if (!frame) return;
  for (const clone of fgs.clones) {
    if (!clone.originGridId) continue;
    const realGrid = frame.grids.find((g) => g.id === clone.originGridId);
    if (!realGrid) continue;
    const snap = clone.originSnapshot;
    for (let ly = 0; ly < snap.height; ly++) {
      for (let lx = 0; lx < snap.width; lx++) {
        if (!snap.pixels[ly * snap.width + lx]) continue;
        set(realGrid, snap.offsetX + lx - realGrid.offsetX, snap.offsetY + ly - realGrid.offsetY, 0);
      }
    }
  }
}

/**
 * Collapses any of a floatingGridSelection's *source* grids that
 * `clearGridSelectionSource` left fully empty to a persistent 1x1 empty
 * shape — Cut's own explicit cleanup, matching paintCell/eraseFromLayer's
 * own keep-on-empty behavior (which `clearGridSelectionSource` deliberately
 * skips; see its own doc comment). Not called by finalizeGridSelection,
 * which always repaints a cleared source grid in the same pass, so it's
 * never actually left empty long enough to collapse.
 */
export function pruneEmptyGridsForSelection(canvas, fgs) {
  const frameIndex = currentFrameIndex(canvas);
  const layer = canvas.layers.find((l) => l.id === fgs.layerId);
  const frame = layer?.frames[frameIndex];
  if (!frame) return;
  for (const clone of fgs.clones) {
    if (!clone.originGridId) continue;
    const realGrid = frame.grids.find((g) => g.id === clone.originGridId);
    if (realGrid && !minimalBounds(realGrid)) {
      collapseToEmptyGrid(realGrid, realGrid.offsetX, realGrid.offsetY);
    }
  }
}

/**
 * Writes a floatingGridSelection back into `canvas` — the Paste half of
 * cut/transform/paste, and the only place any of this touches the real
 * document. A clone with an `originGridId` clears that grid's original
 * cells (clearGridSelectionSource) then paints its *current* (possibly
 * moved/transformed) content back into that exact same Grid object, by
 * id — grid count and every grid's id are unchanged, only geometry/pixels
 * change, matching the "paste-back is strictly per-shape" invariant. A
 * copy-drag/external-paste clone (`originGridId: null`) is inserted as a
 * brand-new Grid instead.
 */
export function finalizeGridSelection(canvas, fgs) {
  clearGridSelectionSource(canvas, fgs);
  const frameIndex = currentFrameIndex(canvas);
  const layer = canvas.layers.find((l) => l.id === fgs.layerId);
  const frame = layer?.frames[frameIndex];
  if (!frame) return;
  for (const clone of fgs.clones) {
    const realGrid = clone.originGridId ? frame.grids.find((g) => g.id === clone.originGridId) : null;
    if (realGrid) {
      for (let ly = 0; ly < clone.grid.height; ly++) {
        for (let lx = 0; lx < clone.grid.width; lx++) {
          if (!clone.grid.pixels[ly * clone.grid.width + lx]) continue;
          const x = clone.grid.offsetX + lx;
          const y = clone.grid.offsetY + ly;
          growGridToInclude(realGrid, x, y);
          set(realGrid, x - realGrid.offsetX, y - realGrid.offsetY, 1);
        }
      }
      shrinkGridToFit(realGrid);
      continue;
    }
    frame.grids.push({ ...clone.grid, visible: true, locked: false });
  }
}

/**
 * A floatingGridSelection formed from destructively-lifted (originGridId
 * set) clones, stripped down to just its Grid-shaped clones — the
 * render-only substitution SvgPixelEditor's composeLayersBody call needs:
 * a shallow-copied preview `doc` where each such clone's *real* grid has
 * just its lifted cells hidden (per `originSnapshot`, the same cells
 * `clearGridSelectionSource` will actually clear at finalize) so it
 * doesn't render twice, once at its old position and once at the floating
 * one — and the clone renders in its place instead. Any part of that real
 * grid *outside* the lift rect (a partially-selected shape) keeps
 * rendering at its real position/style throughout the pending preview,
 * matching what finalize will actually leave behind; previously the whole
 * real grid was excluded outright, which made a partially-lifted shape's
 * unselected remainder vanish from the canvas for the entire pending
 * preview even though the underlying document still had it. Copy-drag/
 * external-paste clones (no real grid to hide) just render as an
 * addition. Never mutates `doc` — every level touched (doc, its layers
 * array, the one affected layer, its frames array, and any grid that gets
 * a cell hidden) is a fresh shallow copy.
 *
 * @param {object} doc
 * @param {{layerId:string, clones:object[]}|null} fgs
 * @returns {object} `doc` itself if `fgs` is null
 */
export function buildFloatingGridPreviewDoc(doc, fgs) {
  if (!fgs) return doc;
  const snapshotById = new Map(fgs.clones.filter((c) => c.originGridId).map((c) => [c.originGridId, c.originSnapshot]));
  const frameIndex = currentFrameIndex(doc);
  return {
    ...doc,
    layers: doc.layers.map((layer) => {
      if (layer.id !== fgs.layerId) return layer;
      return {
        ...layer,
        frames: layer.frames.map((frame, i) => {
          if (i !== frameIndex) return frame;
          const remaining = frame.grids.map((g) => {
            const snap = snapshotById.get(g.id);
            if (!snap) return g;
            const remainder = { ...g, pixels: g.pixels.slice() };
            for (let ly = 0; ly < snap.height; ly++) {
              for (let lx = 0; lx < snap.width; lx++) {
                if (!snap.pixels[ly * snap.width + lx]) continue;
                set(remainder, snap.offsetX + lx - g.offsetX, snap.offsetY + ly - g.offsetY, 0);
              }
            }
            return remainder;
          });
          return { ...frame, grids: [...remaining, ...fgs.clones.map((c) => c.grid)] };
        }),
      };
    }),
  };
}

/**
 * Groups flat {dx,dy,color} cells (as decoded from an external raster
 * paste) into one Grid-shaped clone per distinct color, absolute
 * canvas-space — Shape tier's default paste-in interpretation (see
 * docs/data-model.md's Selection section): a Grid is one style + one
 * boolean bitmap, so a multi-color pasted image can only become one
 * clone per color, never one clone with varying per-pixel color. Every
 * clone is `originGridId: null` (new content, nothing to write back
 * into).
 *
 * @param {number} originX canvas-space
 * @param {number} originY canvas-space
 * @param {{dx:number,dy:number,color:string}[]} cells
 * @returns {object[]} floatingGridSelection.clones
 */
export function buildGridClonesByColor(originX, originY, cells) {
  const byColor = new Map();
  for (const cell of cells) {
    if (!byColor.has(cell.color)) byColor.set(cell.color, []);
    byColor.get(cell.color).push(cell);
  }
  const clones = [];
  for (const [color, groupCells] of byColor) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cell of groupCells) {
      const x = originX + cell.dx;
      const y = originY + cell.dy;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const pixels = new Uint8Array(width * height);
    for (const cell of groupCells) {
      const x = originX + cell.dx;
      const y = originY + cell.dy;
      pixels[(y - minY) * width + (x - minX)] = 1;
    }
    clones.push({
      originGridId: null,
      originSnapshot: null,
      grid: { id: makeGridId(), name: 'Shape', offsetX: minX, offsetY: minY, width, height, pixels, style: { fill: color, effects: [] }, opacity: 1, visible: true, locked: false },
    });
  }
  return clones;
}

/**
 * Collapses flat {dx,dy,color} cells (as decoded from an external raster
 * paste) into a single Grid-shaped clone — a boolean union of every
 * non-empty pixel regardless of its original color, painted with `style`
 * (the currently-active color/style, not anything from the pasted image).
 * The alternative interpretation to `buildGridClonesByColor` above: the
 * right tool for importing a raster silhouette/outline/mask as one
 * paintable, later-restylable shape, at the cost of discarding per-pixel
 * color fidelity (a Grid is one style + one boolean bitmap, so it can't
 * keep both). `originGridId: null` — new content, nothing to write back
 * into.
 *
 * @param {number} originX canvas-space
 * @param {number} originY canvas-space
 * @param {{dx:number,dy:number,color:string}[]} cells
 * @param {{fill:*, effects:object[]}} style
 * @returns {object[]} floatingGridSelection.clones (always length 1)
 */
export function buildGridCloneUnioned(originX, originY, cells, style) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cell of cells) {
    const x = originX + cell.dx;
    const y = originY + cell.dy;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const pixels = new Uint8Array(width * height);
  for (const cell of cells) {
    const x = originX + cell.dx;
    const y = originY + cell.dy;
    pixels[(y - minY) * width + (x - minX)] = 1;
  }
  return [
    {
      originGridId: null,
      originSnapshot: null,
      grid: { id: makeGridId(), name: 'Shape', offsetX: minX, offsetY: minY, width, height, pixels, style, opacity: 1, visible: true, locked: false },
    },
  ];
}
