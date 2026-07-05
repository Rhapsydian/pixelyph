// Shared primitive: a flat, row-major typed-array pixel grid. Used directly
// as a Layer's own local grid and as a Glyph's grid — anything that needs
// "one boolean-ish plane of cells" goes through this, including the
// crop/pad math every resize operation in the app (Canvas, Layer.growToInclude,
// GlyphSet) is built from.

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
