// The Draw-mode document. Phase 1 only ever produces `tier: 'simple'`
// canvases (advanced-tier free-floating layers arrive in Phase 2), but the
// shape already carries the fields Phase 2 needs so this file doesn't need
// to change when that lands — only paintCell's advanced-tier branch does.

import { resizeAt, anchorOffset, ANCHOR_X_FRACS, ANCHOR_Y_FRACS } from './Grid.js';
import { paintSimpleCell } from './autoLayerSync.js';

let nextId = 1;
function makeId() {
  return `canvas-${nextId++}`;
}

/**
 * @param {{ width: number, height: number, palette?: string[] }} options
 * @returns {object} Canvas
 */
export function createCanvas({ width, height, palette = [] }) {
  return {
    id: makeId(),
    width,
    height,
    layers: [],
    tier: 'simple',
    palette,
    simpleTier: { colorToLayerId: new Map() },
    symmetryMode: 'none',
    referenceImage: undefined,
  };
}

/**
 * Paints one cell to `color` (or clears it, if `color` is null/undefined).
 * The single entry point every tool (pencil, shapes, bucket fill, selection
 * paste, raster import) routes through, so tier-specific bookkeeping
 * (simple tier's auto-layer sync) only needs to live in one place.
 *
 * @param {object} canvas
 * @param {number} x
 * @param {number} y
 * @param {string|null} color
 */
export function paintCell(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  if (canvas.tier === 'simple') {
    paintSimpleCell(canvas, x, y, color);
    return;
  }
  throw new Error(`paintCell: advanced tier not implemented until Phase 2 (canvas ${canvas.id})`);
}

/**
 * Resizes the canvas to newWidth x newHeight relative to `anchor`. Any
 * layer that was exactly full-canvas-sized (the invariant simple-tier auto
 * layers maintain) is resized in step via the same `anchor`, via Grid's
 * resize primitive; any other layer just has its offset shifted by the
 * same delta, keeping its own content untouched. See growToInclude for the
 * matching per-paint-stroke case of the identical resizeAt primitive.
 *
 * @param {object} canvas
 * @param {number} newWidth
 * @param {number} newHeight
 * @param {string} [anchor]
 */
export function resizeCanvas(canvas, newWidth, newHeight, anchor = 'top-left') {
  const deltaX = anchorOffset(anchor, canvas.width, newWidth, ANCHOR_X_FRACS, ['left', 'right']);
  const deltaY = anchorOffset(anchor, canvas.height, newHeight, ANCHOR_Y_FRACS, ['top', 'bottom']);
  for (const layer of canvas.layers) {
    const wasFullCanvas = layer.offset.x === 0 && layer.offset.y === 0 && layer.width === canvas.width && layer.height === canvas.height;
    if (wasFullCanvas) {
      layer.frames = layer.frames.map((frame) => ({
        pixels: resizeAt({ width: layer.width, height: layer.height, pixels: frame.pixels }, newWidth, newHeight, deltaX, deltaY).pixels,
      }));
      layer.width = newWidth;
      layer.height = newHeight;
    } else {
      layer.offset = { x: layer.offset.x + deltaX, y: layer.offset.y + deltaY };
    }
  }
  canvas.width = newWidth;
  canvas.height = newHeight;
}

/**
 * Reads the composited color at a canvas-space cell — whichever visible
 * layer nearest the top (end of `layers`) has that cell set. Used by tools
 * that need to know "what's here" (eyedropper, bucket fill, selection
 * extract) without caring how many layers are actually involved.
 *
 * @param {object} canvas
 * @param {number} x
 * @param {number} y
 * @returns {string|null} a solid fill color, or null if the cell is empty/out of bounds
 */
export function colorAt(canvas, x, y) {
  for (let i = canvas.layers.length - 1; i >= 0; i--) {
    const layer = canvas.layers[i];
    if (!layer.visible) continue;
    const lx = x - layer.offset.x;
    const ly = y - layer.offset.y;
    if (lx < 0 || ly < 0 || lx >= layer.width || ly >= layer.height) continue;
    if (layer.frames[0].pixels[ly * layer.width + lx]) {
      return typeof layer.style.fill === 'string' ? layer.style.fill : null;
    }
  }
  return null;
}
