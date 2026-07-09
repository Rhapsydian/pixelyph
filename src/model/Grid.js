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
 * Merges `gridId` into the shape directly below it in `frame.grids` (a
 * "shape merge down"): bounding-box + pixel-OR, same algorithm the
 * pre-migration Layer merge used — a single Grid can only have one style,
 * so fusing two shapes must collapse onto one. The result keeps the
 * *bottom* shape's id/name/style/visible/locked/opacity ("bottom wins",
 * mirroring Canvas.js's mergeLayerDown convention). No-ops if `gridId` is
 * already the bottom-most shape in the frame.
 *
 * @param {{grids: Grid[]}} frame
 * @param {string} gridId the *top* shape of the pair being merged
 */
export function mergeGridDown(frame, gridId) {
  const index = frame.grids.findIndex((g) => g.id === gridId);
  if (index <= 0) return;
  const top = frame.grids[index];
  const bottom = frame.grids[index - 1];
  const minX = Math.min(top.offsetX, bottom.offsetX);
  const minY = Math.min(top.offsetY, bottom.offsetY);
  const maxX = Math.max(top.offsetX + top.width, bottom.offsetX + bottom.width);
  const maxY = Math.max(top.offsetY + top.height, bottom.offsetY + bottom.height);
  const width = maxX - minX;
  const height = maxY - minY;
  const pixels = new Uint8Array(width * height);
  for (const grid of [bottom, top]) {
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (!grid.pixels[y * grid.width + x]) continue;
        pixels[(grid.offsetY + y - minY) * width + (grid.offsetX + x - minX)] = 1;
      }
    }
  }
  bottom.offsetX = minX;
  bottom.offsetY = minY;
  bottom.width = width;
  bottom.height = height;
  bottom.pixels = pixels;
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
