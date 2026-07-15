// Shared primitive: a flat, row-major typed-array pixel grid. Used directly
// as a Glyph's grid and as the base of a styled "Shape" grid (see below) —
// anything that needs "one boolean-ish plane of cells" goes through this,
// including the crop/pad math every resize operation in the app (Canvas,
// GlyphSet) is built from.
//
// Below the bare primitive: a Shape (model type name `Grid`, see
// docs/data-model.md) is one independently-styled, auto-cropped object
// within a Layer's frame — `Layer.frames[i].grids[]`. "Grid" is the
// model/code name; the UI only ever says "Shape" (see data-model.md's
// terminology note) to avoid colliding with GridOverlay's unrelated
// pixel-snapping grid toggle.

/**
 * @typedef {{ width: number, height: number, pixels: Uint8Array }} Grid
 */

/**
 * @param {number} width
 * @param {number} height
 * @returns {Grid}
 */
export function createGrid(width, height) {
  return { width, height, pixels: new Uint8Array(width * height) };
}

/** @returns {number} 0 for out-of-bounds reads rather than throwing — callers scan freely near edges. */
export function get(grid, x, y) {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return 0;
  return grid.pixels[y * grid.width + x];
}

/** No-op for out-of-bounds writes — same "clip silently" contract as get(). */
export function set(grid, x, y, value) {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return;
  grid.pixels[y * grid.width + x] = value;
}

export const ANCHOR_X_FRACS = { left: 0, right: 1, center: 0.5 };
export const ANCHOR_Y_FRACS = { top: 0, bottom: 1, center: 0.5 };

/**
 * Resolves a named anchor ('top-left', 'center', 'bottom-right', ...) to a
 * pixel delta along one axis. Shared by `resize` and Canvas.resize (which
 * repositions each layer's offset by this same delta, independent of
 * resizing the layer's own grid).
 */
export function anchorOffset(anchor, oldSize, newSize, fracs, keys) {
  for (const key of keys) {
    if (anchor.includes(key)) return Math.round((newSize - oldSize) * fracs[key]);
  }
  return Math.round((newSize - oldSize) * fracs.center);
}

/**
 * Crops or pads a grid to newWidth x newHeight, placing the old content's
 * top-left corner at (offsetX, offsetY) in the new grid. Negative offsets
 * crop, positive offsets pad with 0 — the one primitive both `resize`
 * (named anchor) and Layer.growToInclude (exact pixel offset) build on.
 *
 * @param {Grid} grid
 * @param {number} newWidth
 * @param {number} newHeight
 * @param {number} offsetX
 * @param {number} offsetY
 * @returns {Grid} a new grid; the input is left untouched
 */
export function resizeAt(grid, newWidth, newHeight, offsetX, offsetY) {
  const result = createGrid(newWidth, newHeight);
  for (let ny = 0; ny < newHeight; ny++) {
    const oy = ny - offsetY;
    if (oy < 0 || oy >= grid.height) continue;
    for (let nx = 0; nx < newWidth; nx++) {
      const ox = nx - offsetX;
      if (ox < 0 || ox >= grid.width) continue;
      result.pixels[ny * newWidth + nx] = grid.pixels[oy * grid.width + ox];
    }
  }
  return result;
}

/**
 * Crops or pads a grid to newWidth x newHeight relative to `anchor`
 * ('top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' |
 * 'bottom-left' | 'bottom' | 'bottom-right'). One formula handles both
 * directions: growing pads with 0s away from the anchor, shrinking crops
 * away from it — the offset math is identical either way.
 *
 * @param {Grid} grid
 * @param {number} newWidth
 * @param {number} newHeight
 * @param {string} [anchor]
 * @returns {Grid} a new grid; the input is left untouched
 */
export function resize(grid, newWidth, newHeight, anchor = 'top-left') {
  const offsetX = anchorOffset(anchor, grid.width, newWidth, ANCHOR_X_FRACS, ['left', 'right']);
  const offsetY = anchorOffset(anchor, grid.height, newHeight, ANCHOR_Y_FRACS, ['top', 'bottom']);
  return resizeAt(grid, newWidth, newHeight, offsetX, offsetY);
}

/** @returns {Grid} a deep copy — snapshots (history.js) and layer forks both need this. */
export function clone(grid) {
  return { width: grid.width, height: grid.height, pixels: grid.pixels.slice() };
}

// --- Flip/rotate (Checkpoint 6): pure buffer transforms, shared by every
// scope (shape/layer/canvas/glyph) — each scope just decides how to
// reposition the transformed buffer's offset afterward (see Canvas.js for
// the layer/canvas-level axis-remap math, GlyphSet.js for the glyph case).

/** @returns {Uint8Array} a new horizontally-mirrored copy of `pixels` (same width/height). */
export function flipPixelsH(width, height, pixels) {
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      result[y * width + x] = pixels[y * width + (width - 1 - x)];
    }
  }
  return result;
}

/** @returns {Uint8Array} a new vertically-mirrored copy of `pixels` (same width/height). */
export function flipPixelsV(width, height, pixels) {
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      result[y * width + x] = pixels[(height - 1 - y) * width + x];
    }
  }
  return result;
}

/**
 * Rotates a pixel buffer 90° clockwise — width/height swap. Standard raster
 * rotate index remap: new(nx, ny) = old(ny, height-1-nx).
 * @returns {{width: number, height: number, pixels: Uint8Array}}
 */
export function rotatePixels90(width, height, pixels) {
  const newWidth = height;
  const newHeight = width;
  const result = new Uint8Array(newWidth * newHeight);
  for (let ny = 0; ny < newHeight; ny++) {
    for (let nx = 0; nx < newWidth; nx++) {
      result[ny * newWidth + nx] = pixels[(height - 1 - nx) * width + ny];
    }
  }
  return { width: newWidth, height: newHeight, pixels: result };
}

/** Shape-level flip: mirrors a Grid's own buffer in place — bounding box (offset/width/height) unchanged, since it mirrors around its own center. */
export function flipGridH(grid) {
  grid.pixels = flipPixelsH(grid.width, grid.height, grid.pixels);
}

/** @see flipGridH */
export function flipGridV(grid) {
  grid.pixels = flipPixelsV(grid.width, grid.height, grid.pixels);
}

/** Shape-level rotate: rotates a Grid's own buffer 90° clockwise in place, keeping its center fixed (width/height swap repositions offsetX/offsetY so the shape doesn't drift). */
export function rotateGrid90(grid) {
  const { width, height, pixels } = rotatePixels90(grid.width, grid.height, grid.pixels);
  const newOffsetX = Math.round(grid.offsetX + grid.width / 2 - width / 2);
  const newOffsetY = Math.round(grid.offsetY + grid.height / 2 - height / 2);
  grid.width = width;
  grid.height = height;
  grid.pixels = pixels;
  grid.offsetX = newOffsetX;
  grid.offsetY = newOffsetY;
}

/**
 * Transform-menu "Selection" scope (Checkpoint 2, revised): flips/rotates
 * only the portion of `grid`'s own pixels that falls within `rect`
 * (canvas-space, inclusive), remapped around rect's own bounds — so
 * several shapes selected together stay spatially consistent, as if it
 * were one contiguous image, matching how Grid.js's flipPixelsH/V and
 * rotatePixels90 remap a whole buffer. Pixels outside rect, even ones
 * belonging to this same grid, are left completely untouched.
 *
 * Deliberately a pure buffer/offset operation, never touching `style` —
 * unlike the marquee tool's flat per-cell-color floating-selection model
 * (selection.js's extract/paste helpers, still used for Pixel tier and
 * Glyph mode, which have no per-shape style to lose), this is the only
 * path that can move part of a gradient/stroke/effects-styled shape
 * without flattening it to a solid color or merging it into an unrelated
 * shape that happens to share a color.
 *
 * @param {object} grid mutated in place (offset/width/height/pixels only)
 * @param {{x0:number,y0:number,x1:number,y1:number}} rect
 * @param {'flipH'|'flipV'|'rotate90'} kind
 * @returns {boolean} whether the grid actually had any pixels inside rect
 */
export function transformGridRegion(grid, rect, kind) {
  const width = rect.x1 - rect.x0 + 1;
  const height = rect.y1 - rect.y0 + 1;
  const toClear = [];
  const toSet = [];
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!get(grid, x - grid.offsetX, y - grid.offsetY)) continue;
      toClear.push([x, y]);
      const dx = x - rect.x0;
      const dy = y - rect.y0;
      let ndx, ndy;
      if (kind === 'flipH') {
        ndx = width - 1 - dx;
        ndy = dy;
      } else if (kind === 'flipV') {
        ndx = dx;
        ndy = height - 1 - dy;
      } else {
        // rotate90 (90deg CW, matching rotatePixels90's direction)
        ndx = height - 1 - dy;
        ndy = dx;
      }
      toSet.push([rect.x0 + ndx, rect.y0 + ndy]);
    }
  }
  if (toClear.length === 0) return false;
  // Two-phase (collect, then clear, then set) so a pixel swapping places
  // with another one in the same grid can't clear what an earlier set just
  // wrote — every read happens before any write.
  for (const [x, y] of toClear) set(grid, x - grid.offsetX, y - grid.offsetY, 0);
  for (const [x, y] of toSet) {
    growGridToInclude(grid, x, y);
    set(grid, x - grid.offsetX, y - grid.offsetY, 1);
  }
  shrinkGridToFit(grid);
  return true;
}

// --- Shape (Grid) — a styled, auto-cropped object within a Layer's frame ---

/**
 * @typedef {{ fill: string|object|null, stroke?: object, effects: object[] }} ShapeStyle
 * @typedef {{
 *   id: string, name: string, offsetX: number, offsetY: number,
 *   width: number, height: number, pixels: Uint8Array, style: ShapeStyle,
 *   visible: boolean, locked: boolean, opacity: number,
 * }} Grid
 */
// `id` carries no cross-frame semantic identity — it exists only so the UI
// and the active-grid pointer (Canvas.js's resolveActiveGrid) can reference
// "this specific shape" and so React has stable keys. Two grids in
// different frames sharing an id (only possible via duplicateFrame's
// deep-copy-with-same-id) are not "the same shape" to any model logic.

let nextGridId = 1;
/** @returns {string} a fresh `grid-${n}` id — also used directly by Canvas.js's duplicateLayer, which needs a genuinely new shape identity (not the frame-duplicate id-preservation case; see the "id caveat" above). */
export function makeGridId() {
  return `grid-${nextGridId++}`;
}

/**
 * Creates a new 1x1 Shape at canvas-space (offsetX, offsetY). `filled`
 * defaults to true for the "first paint allocates a shape" case
 * `paintCell`/`paintSimpleCell` both need (that one cell really is being
 * painted right now) — pass `filled: false` for an explicit "add a new
 * empty shape" action (the Layers panel's "+ Add Shape", per
 * docs/data-model.md section 1), which shouldn't paint a cell nobody asked
 * for; it just sits invisible until the first real paint stroke grows it.
 *
 * @param {{ name?: string, offsetX: number, offsetY: number, style: ShapeStyle, filled?: boolean }} options
 * @returns {Grid}
 */
export function createShapeGrid({ name = 'Shape', offsetX, offsetY, style, filled = true }) {
  return {
    id: makeGridId(),
    name,
    offsetX,
    offsetY,
    width: 1,
    height: 1,
    pixels: new Uint8Array([filled ? 1 : 0]),
    style,
    visible: true,
    locked: false,
    opacity: 1,
  };
}

/**
 * Reallocates a Grid (offset + width/height) so canvas-space point (x, y)
 * falls inside its bounds. No-ops if already inside. Mutates `grid` in
 * place — direct port of Layer.js's former growToInclude, scoped to one
 * Grid instead of mapping over a layer's whole `frames` array.
 *
 * @param {Grid} grid
 * @param {number} x canvas-space
 * @param {number} y canvas-space
 */
export function growGridToInclude(grid, x, y) {
  const minX = Math.min(grid.offsetX, x);
  const minY = Math.min(grid.offsetY, y);
  const maxX = Math.max(grid.offsetX + grid.width, x + 1);
  const maxY = Math.max(grid.offsetY + grid.height, y + 1);
  if (minX === grid.offsetX && minY === grid.offsetY && maxX === grid.offsetX + grid.width && maxY === grid.offsetY + grid.height) {
    return;
  }
  const newWidth = maxX - minX;
  const newHeight = maxY - minY;
  const padX = grid.offsetX - minX;
  const padY = grid.offsetY - minY;
  grid.pixels = resizeAt({ width: grid.width, height: grid.height, pixels: grid.pixels }, newWidth, newHeight, padX, padY).pixels;
  grid.offsetX = minX;
  grid.offsetY = minY;
  grid.width = newWidth;
  grid.height = newHeight;
}

/** @returns {{minX:number,minY:number,maxX:number,maxY:number}|null} the smallest bounding box containing every set pixel, or null if `grid` is fully empty. */
export function minimalBounds(grid) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!grid.pixels[y * grid.width + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < minX ? null : { minX, minY, maxX, maxY };
}

/**
 * Crops a Grid down to the minimal bounding box of its own set pixels,
 * mutating it in place. Runs after every erase that clears a cell inside a
 * Grid's bounds — the sparsity this whole redesign exists for.
 *
 * @param {Grid} grid
 * @returns {Grid|null} `grid`, or null if it's now fully empty — the caller
 *   deletes it from `frame.grids` in that case.
 */
export function shrinkGridToFit(grid) {
  const bounds = minimalBounds(grid);
  if (!bounds) return null;
  const { minX, minY, maxX, maxY } = bounds;
  const newWidth = maxX - minX + 1;
  const newHeight = maxY - minY + 1;
  grid.pixels = resizeAt(grid, newWidth, newHeight, -minX, -minY).pixels;
  grid.offsetX += minX;
  grid.offsetY += minY;
  grid.width = newWidth;
  grid.height = newHeight;
  return grid;
}

/**
 * Collapses a fully-emptied Grid to a 1x1 all-zero shape anchored at
 * (anchorX, anchorY) — the same representation createShapeGrid's
 * filled:false path produces (addGrid's "+ Add Shape"). Callers use this
 * when shrinkGridToFit returns null (grid has no set pixels left) but want
 * to keep the shape as a persistent empty shape instead of deleting it.
 *
 * @param {Grid} grid mutated in place
 * @param {number} anchorX canvas-space
 * @param {number} anchorY canvas-space
 */
export function collapseToEmptyGrid(grid, anchorX, anchorY) {
  grid.offsetX = anchorX;
  grid.offsetY = anchorY;
  grid.width = 1;
  grid.height = 1;
  grid.pixels = new Uint8Array([0]);
}

/**
 * Pixel-ORs `source` into `target` in place, growing `target`'s bounds to
 * cover both — the shared bounding-box + pixel-OR fusion `mergeGridDown`
 * (below, "bottom wins") and Canvas.js's `dedupeSolidColorGrids` (folding
 * duplicate same-color Simple/Pixel-tier Grids after a layer merge) both
 * need; `target` keeps its own id/name/style/visible/locked/opacity either
 * way, only its geometry/pixels change.
 *
 * @param {Grid} target mutated in place
 * @param {Grid} source read-only
 */
export function unionGridInto(target, source) {
  const minX = Math.min(target.offsetX, source.offsetX);
  const minY = Math.min(target.offsetY, source.offsetY);
  const maxX = Math.max(target.offsetX + target.width, source.offsetX + source.width);
  const maxY = Math.max(target.offsetY + target.height, source.offsetY + source.height);
  const width = maxX - minX;
  const height = maxY - minY;
  const pixels = new Uint8Array(width * height);
  for (const grid of [target, source]) {
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (!grid.pixels[y * grid.width + x]) continue;
        pixels[(grid.offsetY + y - minY) * width + (grid.offsetX + x - minX)] = 1;
      }
    }
  }
  target.offsetX = minX;
  target.offsetY = minY;
  target.width = width;
  target.height = height;
  target.pixels = pixels;
}

/**
 * Merges `gridId` into the shape directly below it in `frame.grids` (a
 * "shape merge down"): a single Grid can only have one style, so fusing two
 * shapes must collapse onto one — the result keeps the *bottom* shape's
 * id/name/style/visible/locked/opacity ("bottom wins", mirroring Canvas.js's
 * mergeLayerDown convention). No-ops if `gridId` is already the bottom-most
 * shape in the frame.
 *
 * @param {{grids: Grid[]}} frame
 * @param {string} gridId the *top* shape of the pair being merged
 */
export function mergeGridDown(frame, gridId) {
  const index = frame.grids.findIndex((g) => g.id === gridId);
  if (index <= 0) return;
  const top = frame.grids[index];
  const bottom = frame.grids[index - 1];
  unionGridInto(bottom, top);
  frame.grids.splice(index, 1);
}

/** @returns {boolean} whether two bare fill values (solid/gradient/pattern/null) should be treated as "the same shape" for resolveActiveGrid's style-match fallback — not a strict deep-equal, just enough to catch the common "same color" case. */
function fillsEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'string' || typeof b === 'string' || a == null || b == null) return a === b;
  if (a.stops || b.stops) {
    if (!a.stops || !b.stops || a.stops.length !== b.stops.length) return false;
    return a.type === b.type && a.angle === b.angle && a.stops.every((s, i) => s.color === b.stops[i].color && s.offset === b.stops[i].offset);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Best-effort "is this the same conceptual shape" check for
 * Canvas.js's resolveActiveGrid — compares fill, stroke, and effects.
 * Not a strict deep-equal (there's no general one in this codebase); good
 * enough for a UX fallback where the failure mode is a one-click correction.
 *
 * @param {ShapeStyle} a
 * @param {ShapeStyle} b
 * @returns {boolean}
 */
export function stylesEqual(a, b) {
  if (!fillsEqual(a.fill, b.fill)) return false;
  if (JSON.stringify(a.stroke) !== JSON.stringify(b.stroke)) return false;
  return JSON.stringify(a.effects) === JSON.stringify(b.effects);
}
