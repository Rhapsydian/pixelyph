// The Draw-mode document. `tier: 'simple'` canvases reconcile auto-managed
// per-color layers (autoLayerSync.js); `tier: 'advanced'` canvases expose
// free-floating, independently styled layers the user manages directly —
// paintCell's advanced branch just paints/erases into whichever layer is
// `activeLayerId`, growing it (growToInclude) as a stroke extends past its
// current bounds.

import { resizeAt, anchorOffset, ANCHOR_X_FRACS, ANCHOR_Y_FRACS, set } from './Grid.js';
import { paintSimpleCell } from './autoLayerSync.js';
import { createLayer, growToInclude } from './Layer.js';

function cloneLayerStyle(style) {
  return {
    fill: typeof style.fill === 'string' || style.fill == null ? style.fill : { ...style.fill, stops: style.fill.stops.map((s) => ({ ...s })) },
    stroke: style.stroke ? { ...style.stroke, ...(style.stroke.dashArray ? { dashArray: style.stroke.dashArray.slice() } : {}) } : undefined,
    effects: style.effects.map((e) => ({ ...e })),
  };
}

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
    // Which layer advanced-tier painting targets, and which the LayersPanel
    // shows as selected. A working-session concern like symmetryMode above
    // (persisted, but not part of undo snapshots) rather than artwork
    // content, so it lives here rather than being threaded through explicitly.
    activeLayerId: null,
  };
}

/**
 * Paints one cell to `color` (or clears it, if `color` is null/undefined).
 * The single entry point every tool (pencil, shapes, bucket fill, selection
 * paste, raster import) routes through, so tier-specific bookkeeping
 * (simple tier's auto-layer sync, advanced tier's active-layer targeting)
 * only needs to live in one place.
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
  const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
  if (!layer || layer.locked) return;
  if (color) {
    growToInclude(layer, x, y);
    set({ width: layer.width, height: layer.height, pixels: layer.frames[0].pixels }, x - layer.offset.x, y - layer.offset.y, 1);
  } else {
    set({ width: layer.width, height: layer.height, pixels: layer.frames[0].pixels }, x - layer.offset.x, y - layer.offset.y, 0);
  }
}

/**
 * Adds a new full-canvas-sized layer, makes it active, and returns it —
 * the "+" button in LayersPanel. Sized full-canvas so it's immediately
 * paintable without a preceding grow; growToInclude still applies once a
 * stroke or offset move takes it past those bounds.
 *
 * @param {object} canvas
 * @param {{ name?: string, fill?: string }} [options]
 * @returns {object} Layer
 */
export function addLayer(canvas, { name, fill = '#000000' } = {}) {
  const layer = createLayer({ name: name ?? `Layer ${canvas.layers.length + 1}`, width: canvas.width, height: canvas.height, fill });
  canvas.layers.push(layer);
  canvas.activeLayerId = layer.id;
  return layer;
}

/**
 * Removes a layer and re-clamps `activeLayerId` to a layer that still
 * exists (the topmost remaining one), or null if none are left.
 *
 * @param {object} canvas
 * @param {string} layerId
 */
export function removeLayer(canvas, layerId) {
  canvas.layers = canvas.layers.filter((l) => l.id !== layerId);
  for (const [color, id] of canvas.simpleTier.colorToLayerId) {
    if (id === layerId) canvas.simpleTier.colorToLayerId.delete(color);
  }
  clampActiveLayer(canvas);
}

/**
 * Swaps a layer with its neighbor one step towards the front (+1) or back
 * (-1) of the stack (`canvas.layers` is back-to-front, matching how
 * composeLayersSvg/SvgPixelEditor iterate it). No-ops at either end.
 *
 * @param {object} canvas
 * @param {string} layerId
 * @param {1|-1} direction
 */
export function reorderLayer(canvas, layerId, direction) {
  const i = canvas.layers.findIndex((l) => l.id === layerId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= canvas.layers.length) return;
  const layers = canvas.layers.slice();
  [layers[i], layers[j]] = [layers[j], layers[i]];
  canvas.layers = layers;
}

/**
 * Duplicates a layer (independent pixel buffers and style — mutating one
 * afterward never affects the other) and inserts the copy directly above
 * the original, making it active.
 *
 * @param {object} canvas
 * @param {string} layerId
 * @returns {object|null} the new layer, or null if `layerId` doesn't exist
 */
export function duplicateLayer(canvas, layerId) {
  const index = canvas.layers.findIndex((l) => l.id === layerId);
  if (index < 0) return null;
  const original = canvas.layers[index];
  const copy = createLayer({ name: `${original.name} copy`, width: original.width, height: original.height, offset: original.offset });
  copy.visible = original.visible;
  copy.locked = original.locked;
  copy.opacity = original.opacity;
  copy.style = cloneLayerStyle(original.style);
  copy.frames = original.frames.map((frame) => ({ pixels: frame.pixels.slice() }));
  canvas.layers.splice(index + 1, 0, copy);
  canvas.activeLayerId = copy.id;
  return copy;
}

/**
 * Merges a layer into the one directly below it in the stack (a "merge
 * down"): pixel data from both is combined (boolean OR, in canvas space —
 * they can have different offsets/sizes) into one grid sized to bound both.
 * The result keeps the *bottom* layer's id/name/style/visible/locked/
 * opacity — matching how Photoshop/Aseprite's own "Merge Down" resolves
 * which layer's settings survive — and the top layer is removed. No-ops if
 * `layerId` is already the bottom-most layer (nothing to merge into).
 *
 * @param {object} canvas
 * @param {string} layerId the *top* layer of the pair being merged
 */
export function mergeLayerDown(canvas, layerId) {
  const index = canvas.layers.findIndex((l) => l.id === layerId);
  if (index <= 0) return;
  const top = canvas.layers[index];
  const bottom = canvas.layers[index - 1];
  const minX = Math.min(top.offset.x, bottom.offset.x);
  const minY = Math.min(top.offset.y, bottom.offset.y);
  const maxX = Math.max(top.offset.x + top.width, bottom.offset.x + bottom.width);
  const maxY = Math.max(top.offset.y + top.height, bottom.offset.y + bottom.height);
  const width = maxX - minX;
  const height = maxY - minY;
  const pixels = new Uint8Array(width * height);
  for (const layer of [bottom, top]) {
    const frame = layer.frames[0];
    for (let y = 0; y < layer.height; y++) {
      for (let x = 0; x < layer.width; x++) {
        if (!frame.pixels[y * layer.width + x]) continue;
        const nx = layer.offset.x + x - minX;
        const ny = layer.offset.y + y - minY;
        pixels[ny * width + nx] = 1;
      }
    }
  }
  bottom.offset = { x: minX, y: minY };
  bottom.width = width;
  bottom.height = height;
  bottom.frames = [{ pixels }];
  canvas.layers.splice(index, 1);
  canvas.activeLayerId = bottom.id;
}

/**
 * Clears one cell from a specific layer's own local grid, regardless of
 * `canvas.activeLayerId` — the primitive a multi-layer-aware selection cut
 * needs (paintCell's advanced-tier erase only ever targets the active
 * layer; see the "select from all visible layers" cut path in selection.js).
 * No-ops out-of-bounds or on a locked layer, matching paintCell's own
 * "locked blocks writes" convention.
 *
 * @param {object} layer
 * @param {number} canvasX
 * @param {number} canvasY
 */
export function eraseFromLayer(layer, canvasX, canvasY) {
  if (layer.locked) return;
  const lx = canvasX - layer.offset.x;
  const ly = canvasY - layer.offset.y;
  set({ width: layer.width, height: layer.height, pixels: layer.frames[0].pixels }, lx, ly, 0);
}

/**
 * If `canvas.activeLayerId` no longer refers to an existing layer (a layer
 * was removed, or an undo/redo restored a different `layers` array),
 * re-points it at the topmost remaining layer, or null if none. Called
 * after any operation that can invalidate it.
 *
 * @param {object} canvas
 */
export function clampActiveLayer(canvas) {
  if (canvas.layers.some((l) => l.id === canvas.activeLayerId)) return;
  canvas.activeLayerId = canvas.layers.length ? canvas.layers[canvas.layers.length - 1].id : null;
}

/**
 * Finds the topmost visible layer that has a cell set at canvas-space
 * (x, y) — the advanced-tier eyedropper's "which layer is this" query
 * (picking a single color is ambiguous once gradient fills exist, so it
 * activates a layer instead; see eyedropperTool).
 *
 * @param {object} canvas
 * @param {number} x
 * @param {number} y
 * @returns {object|null} Layer
 */
export function topVisibleLayerAt(canvas, x, y) {
  for (let i = canvas.layers.length - 1; i >= 0; i--) {
    const layer = canvas.layers[i];
    if (!layer.visible) continue;
    const lx = x - layer.offset.x;
    const ly = y - layer.offset.y;
    if (lx < 0 || ly < 0 || lx >= layer.width || ly >= layer.height) continue;
    if (layer.frames[0].pixels[ly * layer.width + lx]) return layer;
  }
  return null;
}

/**
 * Switches `canvas.tier`. Simple -> advanced is always safe: it just flips
 * every layer's `autoManaged` off, handing them over as free-floating
 * layers with their existing style/position untouched. Advanced -> simple
 * is potentially lossy (the caller should confirm first): every layer is
 * discarded and rebuilt as auto-managed, one per distinct composited color,
 * by re-painting each canvas cell's `colorAt` result through the normal
 * simple-tier path — cells under a non-solid fill (gradient) have no
 * simple-tier equivalent and are dropped, and overlapping layers of the
 * same color merge, exactly as "lossy" implies.
 *
 * @param {object} canvas
 * @param {'simple'|'advanced'} newTier
 */
export function convertTier(canvas, newTier) {
  if (canvas.tier === newTier) return;
  if (newTier === 'advanced') {
    for (const layer of canvas.layers) layer.autoManaged = false;
    canvas.simpleTier = { colorToLayerId: new Map() };
    canvas.tier = 'advanced';
    clampActiveLayer(canvas);
    return;
  }
  const cells = [];
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const color = colorAt(canvas, x, y);
      if (color) cells.push({ x, y, color });
    }
  }
  canvas.layers = [];
  canvas.simpleTier = { colorToLayerId: new Map() };
  canvas.tier = 'simple';
  canvas.activeLayerId = null;
  for (const cell of cells) paintSimpleCell(canvas, cell.x, cell.y, cell.color);
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
