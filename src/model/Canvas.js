// The Draw-mode document. `tier: 'simple'` canvases reconcile a single
// auto-managed layer whose per-frame shapes are scanned/created by style
// (autoLayerSync.js); `tier: 'advanced'` canvases expose free-floating,
// independently styled layers the user manages directly — paintCell's
// advanced branch paints/erases into whichever Grid (Shape) is
// `activeGridId`, within whichever layer is `activeLayerId`, growing it
// (growGridToInclude) as a stroke extends past its current bounds, or
// creating a brand new Grid if the active layer has no shape in this frame
// yet. See docs/data-model.md for the full Layer/Frame/Grid model this is
// built against — a Layer is pure identity/z-order; a Grid ("Shape" in the
// UI) is the actual styled, auto-cropped pixel content, one or more per
// layer per frame.

import { resizeAt, anchorOffset, ANCHOR_X_FRACS, ANCHOR_Y_FRACS, get, set, createShapeGrid, growGridToInclude, shrinkGridToFit, mergeGridDown as mergeGridInFrame, unionGridInto, stylesEqual, makeGridId, flipPixelsH, flipPixelsV, rotatePixels90 } from './Grid.js';
import { paintSimpleCell } from './autoLayerSync.js';
import { createLayer } from './Layer.js';
import { normalizePalette } from './Palette.js';

/**
 * Deep-clones a bare fill value (solid/gradient/pattern/null) — gradients'
 * `stops` array is the only nested structure that needs its own copy;
 * patterns (content/width/height) and solid strings have nothing further
 * to clone.
 *
 * @param {string|object|null} fill
 * @returns {string|object|null}
 */
export function cloneFillValue(fill) {
  if (typeof fill === 'string' || fill == null) return fill;
  return { ...fill, ...(fill.stops ? { stops: fill.stops.map((s) => ({ ...s })) } : {}) };
}

/**
 * Deep-clones a Grid's style (fill/stroke/effects) so mutating one shape's
 * style afterward never affects another — used by duplicateLayer/
 * duplicateFrame, and by the palette's "save style"/"apply style" flow
 * (state/store.js). Named for the pre-migration `Layer.style` this used to
 * clone; the shape (`{fill,stroke,effects}`) is identical on `Grid.style`.
 *
 * @param {object} style
 * @returns {object} an independent copy
 */
export function cloneLayerStyle(style) {
  return {
    fill: cloneFillValue(style.fill),
    stroke: style.stroke ? { ...style.stroke, ...(style.stroke.dashArray ? { dashArray: style.stroke.dashArray.slice() } : {}) } : undefined,
    effects: style.effects.map((e) => ({ ...e })),
  };
}

let nextId = 1;
function makeId() {
  return `canvas-${nextId++}`;
}

/**
 * @param {{ width: number, height: number, palette?: string[]|{colors?:string[],fills?:object[],styles?:object[]} }} options
 * @returns {object} Canvas
 */
export function createCanvas({ width, height, palette = [] }) {
  return {
    id: makeId(),
    width,
    height,
    layers: [],
    tier: 'simple',
    palette: normalizePalette(palette),
    symmetryMode: 'none',
    referenceImage: undefined,
    // Which layer advanced-tier painting targets, and which the LayersPanel
    // shows as selected. A working-session concern like symmetryMode above
    // (persisted, but not part of undo snapshots) rather than artwork
    // content, so it lives here rather than being threaded through explicitly.
    activeLayerId: null,
    // Which Grid (Shape), within the active layer's active frame, painting
    // targets and the style editor edits — see resolveActiveGrid below for
    // how this is kept sensible across frame/layer switches.
    activeGridId: null,
    // Animation (Phase 7): every layer's `frames` array is kept the same
    // length (`frameCount`) uniformly — see addFrame/duplicateFrame/
    // removeFrame below, the only places that length ever changes.
    // `frameCount` is artwork content (part of undo snapshots, like
    // width/height); `activeFrame` is a working-session pointer (like
    // activeLayerId) into that array — persisted, but excluded from undo.
    frameCount: 1,
    activeFrame: 0,
    // `frameRate` is only the *default* pace used when a new frame is added
    // (see defaultFrameDurationMs) — actual per-frame timing lives in
    // frameDurations (ms), one entry per frame, kept the same length as
    // frameCount exactly like every layer's `frames` array. Content, like
    // frameCount, so both are undo-tracked (see store.js's contentSnapshot).
    frameRate: 12,
    frameDurations: [Math.round(1000 / 12)],
  };
}

/** @returns {number} the frame index every paint/read operation should target — clamps defensively in case activeFrame ever drifts out of range (e.g. an older saved project). */
export function currentFrameIndex(canvas) {
  return Math.max(0, Math.min(canvas.activeFrame ?? 0, canvas.frameCount - 1));
}

/** @returns {number} the duration (ms) a newly-added blank frame gets, derived from the canvas's default frame rate. */
function defaultFrameDurationMs(canvas) {
  return Math.max(1, Math.round(1000 / canvas.frameRate));
}

/**
 * Finds the topmost (last, per the array's back-to-front convention) Grid
 * in `frame.grids` whose own pixels have (x, y) set — the shared spatial
 * lookup `colorAt`/`topVisibleLayerAt`/`eraseFromLayer` all need, now that a
 * layer's content can be more than one independently-positioned shape.
 *
 * @param {{grids: object[]}} frame
 * @param {number} x canvas-space
 * @param {number} y canvas-space
 * @param {{skipLocked?: boolean}} [options] `skipLocked` excludes locked
 *   shapes — used by erase, which (like paintCell) can't touch a locked Grid.
 * @returns {object|null} Grid
 */
export function topGridAt(frame, x, y, { skipLocked = false } = {}) {
  for (let i = frame.grids.length - 1; i >= 0; i--) {
    const grid = frame.grids[i];
    if (!grid.visible) continue;
    if (skipLocked && grid.locked) continue;
    if (get(grid, x - grid.offsetX, y - grid.offsetY)) return grid;
  }
  return null;
}

/**
 * Resolves which Grid (Shape) should become `activeGridId` after the active
 * frame or active layer changes. Tries, in order: the same shape by `id`
 * (survives `duplicateFrame`, whose copies keep their source ids), then a
 * shape with an equal style (a reasonable proxy for "the same conceptual
 * shape" across independently-drawn frames — keeps selection sticky while
 * scrubbing animation without forcing a re-click every frame), then just the
 * first shape in the list. See docs/data-model.md section 2 for the full
 * rationale.
 *
 * @param {object|undefined|null} layer
 * @param {number} frameIndex
 * @param {object|null} prevGrid the previously active Grid, if any
 * @returns {string|null}
 */
export function resolveActiveGrid(layer, frameIndex, prevGrid) {
  const grids = layer?.frames[frameIndex]?.grids ?? [];
  if (grids.length === 0) return null;
  if (prevGrid) {
    const sameId = grids.find((g) => g.id === prevGrid.id);
    if (sameId) return sameId.id;
    const styleMatch = grids.find((g) => stylesEqual(g.style, prevGrid.style));
    if (styleMatch) return styleMatch.id;
  }
  return grids[0].id;
}

/**
 * Paints one cell to `color` (or clears it, if `color` is null/undefined).
 * The single entry point every tool (pencil, shapes, bucket fill, selection
 * paste, raster import) routes through, so tier-specific bookkeeping
 * (simple tier's auto-layer sync, advanced tier's active-shape targeting)
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
  const frameIndex = currentFrameIndex(canvas);
  const frame = layer.frames[frameIndex];
  // A layer hidden in the currently-active frame is effectively locked for
  // that frame — same "can't be edited" contract `locked` already has,
  // just scoped to whichever frame you're actually looking at (a layer can
  // be hidden in frame 2 and visible, paintable, in frame 3).
  if (!frame.visible) return;
  const grid = frame.grids.find((g) => g.id === canvas.activeGridId);
  if (grid?.locked) return;
  if (!color) {
    if (!grid) return;
    if (!get(grid, x - grid.offsetX, y - grid.offsetY)) return;
    set(grid, x - grid.offsetX, y - grid.offsetY, 0);
    if (!shrinkGridToFit(grid)) {
      frame.grids = frame.grids.filter((g) => g.id !== grid.id);
      if (canvas.activeGridId === grid.id) canvas.activeGridId = frame.grids[0]?.id ?? null;
    }
    return;
  }
  if (!grid) {
    // Nothing selected, or the active layer has no shape in this frame yet —
    // same "first paint allocates" pattern growGridToInclude already covers
    // for an existing shape, just also covering "first paint in this frame
    // at all."
    const newGrid = createShapeGrid({ name: `Shape ${frame.grids.length + 1}`, offsetX: x, offsetY: y, style: { fill: color, effects: [] } });
    frame.grids.push(newGrid);
    canvas.activeGridId = newGrid.id;
    return;
  }
  growGridToInclude(grid, x, y);
  set(grid, x - grid.offsetX, y - grid.offsetY, 1);
}

/**
 * Adds a new, empty layer (no shapes yet — the first paint stroke creates
 * one, see paintCell) and makes it active.
 *
 * @param {object} canvas
 * @param {{ name?: string }} [options]
 * @returns {object} Layer
 */
export function addLayer(canvas, { name } = {}) {
  const layer = createLayer({ name: name ?? `Layer ${canvas.layers.length + 1}`, frameCount: canvas.frameCount });
  canvas.layers.push(layer);
  canvas.activeLayerId = layer.id;
  refreshActiveGrid(canvas);
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
 * Duplicates a layer (independent shapes — mutating one afterward never
 * affects the other) and inserts the copy directly above the original,
 * making it active. Each copied Grid gets a **fresh id**: unlike
 * `duplicateFrame` (which must preserve ids so the same shape survives a
 * frame duplicate, see resolveActiveGrid), this is a genuinely new,
 * separate layer's shapes, not a continuation of the originals' identity.
 *
 * @param {object} canvas
 * @param {string} layerId
 * @returns {object|null} the new layer, or null if `layerId` doesn't exist
 */
export function duplicateLayer(canvas, layerId) {
  const index = canvas.layers.findIndex((l) => l.id === layerId);
  if (index < 0) return null;
  const original = canvas.layers[index];
  const copy = createLayer({ name: `${original.name} copy`, frameCount: original.frames.length });
  copy.locked = original.locked;
  copy.opacity = original.opacity;
  copy.frames = original.frames.map((frame) => ({
    visible: frame.visible,
    grids: frame.grids.map((g) => ({ ...g, id: makeGridId(), pixels: g.pixels.slice(), style: cloneLayerStyle(g.style) })),
  }));
  canvas.layers.splice(index + 1, 0, copy);
  canvas.activeLayerId = copy.id;
  refreshActiveGrid(canvas);
  return copy;
}

/**
 * Folds duplicate same-solid-color Grids in `frame` down to one per color,
 * pixel-ORing each later duplicate into the first Grid of that color (via
 * `unionGridInto`, Grid.js) and dropping the duplicate. `mergeLayerDown`
 * runs this after concatenating two Simple/Pixel-tier layers' grids: each
 * layer independently auto-manages its own one-Grid-per-color shapes (see
 * autoLayerSync.js), so two layers each holding, say, a "red" Grid would
 * otherwise leave two red Grids after a plain concatenation — breaking
 * Simple/Pixel tier's one-Grid-per-color invariant. Non-solid fills can't
 * collide by definition (Simple/Pixel tier never creates them) and are left
 * alone. Grids keep the stacking position of their *first* appearance.
 *
 * @param {{grids: object[]}} frame
 */
function dedupeSolidColorGrids(frame) {
  const byColor = new Map();
  const kept = [];
  for (const grid of frame.grids) {
    const color = grid.style.fill;
    const owner = typeof color === 'string' ? byColor.get(color) : null;
    if (owner) {
      unionGridInto(owner, grid);
    } else {
      kept.push(grid);
      if (typeof color === 'string') byColor.set(color, grid);
    }
  }
  frame.grids = kept;
}

/**
 * Merges a layer into the one directly below it in the stack (a "merge
 * down"): every frame's shapes are concatenated, bottom's staying toward
 * the back and top's toward the front — no pixel math or bounding-box
 * computation needed, since each Grid already carries its own independent
 * offset/size/style (contrast with `mergeGridDown` in Grid.js, which fuses
 * two shapes into one and does need that). A frame where the top layer was
 * hidden translates that into `visible: false` on each of its incoming
 * shapes, rather than dropping it silently. In Simple/Pixel tier, the
 * concatenation runs through `dedupeSolidColorGrids` afterward, since each
 * layer's own auto-managed same-color Grid would otherwise survive as two
 * separate Grids instead of one — Advanced/Shape tier is exempt, since it
 * legitimately keeps same-color shapes separate. The top layer is removed;
 * no-ops if `layerId` is already the bottom-most layer.
 *
 * @param {object} canvas
 * @param {string} layerId the *top* layer of the pair being merged
 */
export function mergeLayerDown(canvas, layerId) {
  const index = canvas.layers.findIndex((l) => l.id === layerId);
  if (index <= 0) return;
  const top = canvas.layers[index];
  const bottom = canvas.layers[index - 1];
  bottom.frames.forEach((bottomFrame, i) => {
    const topFrame = top.frames[i];
    const incoming = topFrame.visible ? topFrame.grids : topFrame.grids.map((g) => ({ ...g, visible: false }));
    bottomFrame.grids = [...bottomFrame.grids, ...incoming];
    if (canvas.tier === 'simple') dedupeSolidColorGrids(bottomFrame);
  });
  canvas.layers.splice(index, 1);
  canvas.activeLayerId = bottom.id;
  refreshActiveGrid(canvas);
}

/**
 * Adds a new 1x1 Grid (Shape) to `layerId`'s current frame and makes it the
 * active shape — the "+ Add Shape" toolbar action (see docs/data-model.md
 * section 4). Distinct from paintCell's own "first paint allocates a Grid"
 * path: this is an explicit "start a new shape" action, for when the active
 * layer's current frame already has a shape and painting would just grow it
 * instead of starting a separate one.
 *
 * @param {object} canvas
 * @param {string} layerId
 * @param {{ name?: string, style?: object }} [options]
 * @returns {object|null} the new Grid, or null if `layerId` doesn't exist
 */
export function addGrid(canvas, layerId, { name, style } = {}) {
  const layer = canvas.layers.find((l) => l.id === layerId);
  if (!layer) return null;
  const frame = layer.frames[currentFrameIndex(canvas)];
  const grid = createShapeGrid({
    name: name ?? `Shape ${frame.grids.length + 1}`,
    offsetX: Math.floor(canvas.width / 2),
    offsetY: Math.floor(canvas.height / 2),
    style: style ?? { fill: '#808080', effects: [] },
    filled: false,
  });
  frame.grids.push(grid);
  canvas.activeLayerId = layerId;
  canvas.activeGridId = grid.id;
  return grid;
}

/**
 * Removes a shape from `layerId`'s current frame and re-clamps
 * `activeGridId` to the frame's first remaining shape, or null if none are
 * left.
 *
 * @param {object} canvas
 * @param {string} layerId
 * @param {string} gridId
 */
export function removeGrid(canvas, layerId, gridId) {
  const layer = canvas.layers.find((l) => l.id === layerId);
  if (!layer) return;
  const frame = layer.frames[currentFrameIndex(canvas)];
  frame.grids = frame.grids.filter((g) => g.id !== gridId);
  if (canvas.activeGridId === gridId) canvas.activeGridId = frame.grids[0]?.id ?? null;
}

/**
 * Swaps a shape with its neighbor one step towards the front (+1) or back
 * (-1) of `layerId`'s current-frame shape list (`frame.grids` is
 * back-to-front, matching `canvas.layers`'s own convention). No-ops at
 * either end.
 *
 * @param {object} canvas
 * @param {string} layerId
 * @param {string} gridId
 * @param {1|-1} direction
 */
export function reorderGrid(canvas, layerId, gridId, direction) {
  const layer = canvas.layers.find((l) => l.id === layerId);
  if (!layer) return;
  const frame = layer.frames[currentFrameIndex(canvas)];
  const i = frame.grids.findIndex((g) => g.id === gridId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= frame.grids.length) return;
  const grids = frame.grids.slice();
  [grids[i], grids[j]] = [grids[j], grids[i]];
  frame.grids = grids;
}

/**
 * Duplicates a shape within `layerId`'s current frame, inserting the copy
 * directly above the original and making it active. The copy gets a fresh
 * id — same "genuinely new, separate identity" convention as
 * duplicateLayer, not duplicateFrame's id-preserving one.
 *
 * @param {object} canvas
 * @param {string} layerId
 * @param {string} gridId
 * @returns {object|null} the new Grid, or null if `layerId`/`gridId` don't exist
 */
export function duplicateGrid(canvas, layerId, gridId) {
  const layer = canvas.layers.find((l) => l.id === layerId);
  if (!layer) return null;
  const frame = layer.frames[currentFrameIndex(canvas)];
  const index = frame.grids.findIndex((g) => g.id === gridId);
  if (index < 0) return null;
  const original = frame.grids[index];
  const copy = { ...original, id: makeGridId(), pixels: original.pixels.slice(), style: cloneLayerStyle(original.style) };
  frame.grids = [...frame.grids.slice(0, index + 1), copy, ...frame.grids.slice(index + 1)];
  canvas.activeLayerId = layerId;
  canvas.activeGridId = copy.id;
  return copy;
}

/**
 * Merges a shape into the one directly below it in `layerId`'s current
 * frame (Grid.js's `mergeGridDown` primitive, re-scoped here to resolve the
 * layer/frame from ids like every other canvas-level action does) and lands
 * `activeGridId` on the surviving (bottom) shape.
 *
 * @param {object} canvas
 * @param {string} layerId
 * @param {string} gridId the *top* shape of the pair being merged
 */
export function mergeGridDown(canvas, layerId, gridId) {
  const layer = canvas.layers.find((l) => l.id === layerId);
  if (!layer) return;
  const frame = layer.frames[currentFrameIndex(canvas)];
  const index = frame.grids.findIndex((g) => g.id === gridId);
  if (index <= 0) return;
  const bottom = frame.grids[index - 1];
  mergeGridInFrame(frame, gridId);
  canvas.activeGridId = bottom.id;
}

/**
 * Clears one cell from a specific layer's own current-frame shapes,
 * regardless of `canvas.activeLayerId` — the primitive a multi-layer-aware
 * selection cut needs (paintCell's advanced-tier erase only ever targets the
 * active layer+shape; see the "select from all visible layers" cut path in
 * selection.js). Finds whichever (unlocked) shape in the layer's active
 * frame owns the cell, clears it, and shrinks/deletes that shape exactly
 * like paintCell's own erase path. No-ops out-of-bounds, on a locked layer,
 * or if no unlocked shape owns the cell.
 *
 * @param {object} canvas
 * @param {object} layer
 * @param {number} canvasX
 * @param {number} canvasY
 */
export function eraseFromLayer(canvas, layer, canvasX, canvasY) {
  if (layer.locked) return;
  const frame = layer.frames[currentFrameIndex(canvas)];
  const grid = topGridAt(frame, canvasX, canvasY, { skipLocked: true });
  if (!grid) return;
  set(grid, canvasX - grid.offsetX, canvasY - grid.offsetY, 0);
  if (!shrinkGridToFit(grid)) {
    frame.grids = frame.grids.filter((g) => g.id !== grid.id);
    if (canvas.activeGridId === grid.id) canvas.activeGridId = frame.grids[0]?.id ?? null;
  }
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
  refreshActiveGrid(canvas);
}

/**
 * Re-derives `activeGridId` for the current `activeLayerId`/active frame —
 * the "a structural edit changed which layer/frames exist" case. Frame-to-
 * frame scrubbing (`setActiveFrame`) uses `resolveActiveGrid` directly
 * instead, with a real `prevGrid`, since sticky selection only matters
 * there.
 *
 * By default this carries no previously-active-shape selection over (a
 * real layer change has no "same shape" to keep). `prevLayerId`, if passed
 * and equal to the (already-mutated) `canvas.activeLayerId`, signals the
 * layer didn't actually change — e.g. re-clicking the already-active layer
 * row, or an eyedropper click landing back on it — in which case the
 * currently-active grid is passed through as `prevGrid` so
 * `resolveActiveGrid`'s id-match branch keeps it selected instead of
 * falling through to the layer's first shape.
 *
 * @param {object} canvas
 * @param {string|null} [prevLayerId] `canvas.activeLayerId`'s value before
 *   the caller changed it, if known.
 */
export function refreshActiveGrid(canvas, prevLayerId = null) {
  const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
  const frameIndex = currentFrameIndex(canvas);
  const sameLayer = prevLayerId != null && prevLayerId === canvas.activeLayerId;
  const prevGrid = sameLayer ? layer?.frames[frameIndex]?.grids.find((g) => g.id === canvas.activeGridId) : null;
  canvas.activeGridId = resolveActiveGrid(layer, frameIndex, prevGrid);
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
  const frameIndex = currentFrameIndex(canvas);
  for (let i = canvas.layers.length - 1; i >= 0; i--) {
    const layer = canvas.layers[i];
    const frame = layer.frames[frameIndex];
    if (!frame.visible) continue;
    if (topGridAt(frame, x, y)) return layer;
  }
  return null;
}

/**
 * Collapses one layer's Advanced/Shape-tier shapes in the canvas's active
 * frame into Simple/Pixel tier's one-Grid-per-color shape, mutating `layer`
 * in place — `convertTier`'s per-layer building block. Scans this layer's
 * own frame only (`topGridAt`-wins across this layer's own shapes, mirroring
 * `selection.js`'s `extractRectFromActiveLayer`), so a multi-layer canvas
 * keeps its layer count/order/names/lock/opacity/per-frame visibility
 * instead of flattening onto one layer. Cells under a non-solid fill
 * (gradient) have no simple-tier equivalent and are dropped, same as before
 * this was made per-layer. Only the active frame is rebuilt — every other
 * frame's shapes are discarded (`frame.visible` is left untouched), matching
 * the pre-migration behavior of only ever reconstructing the active frame.
 *
 * @param {object} canvas
 * @param {object} layer
 */
function collapseLayerToAutoGrids(canvas, layer) {
  const frameIndex = currentFrameIndex(canvas);
  const sourceFrame = layer.frames[frameIndex];
  const cells = [];
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const grid = topGridAt(sourceFrame, x, y);
      if (grid && typeof grid.style.fill === 'string') cells.push({ x, y, color: grid.style.fill });
    }
  }
  layer.frames.forEach((frame) => {
    frame.grids = [];
  });
  const targetFrame = layer.frames[frameIndex];
  for (const cell of cells) {
    let target = targetFrame.grids.find((g) => g.style.fill === cell.color);
    if (!target) {
      target = createShapeGrid({ name: cell.color, offsetX: cell.x, offsetY: cell.y, style: { fill: cell.color, effects: [] } });
      targetFrame.grids.push(target);
    } else {
      growGridToInclude(target, cell.x, cell.y);
    }
    set(target, cell.x - target.offsetX, cell.y - target.offsetY, 1);
  }
}

/**
 * Switches `canvas.tier`. Simple -> advanced is always safe: every Simple-
 * tier layer is already a real Layer (see autoLayerSync.js), so this just
 * flips the tier flag and hands the existing layers over as free-floating
 * ones — or, for a blank canvas with no layers yet, creates one so advanced
 * tier never opens onto an unpaintable empty layer stack (matching the
 * "+ Add Layer" button's own default). Advanced -> simple is potentially
 * lossy per layer (the caller should confirm first): each layer is
 * collapsed independently via `collapseLayerToAutoGrids` — layer count,
 * order, names, lock, and opacity all survive; only each layer's *shapes*
 * are rebuilt into Simple tier's one-Grid-per-color form, dropping
 * gradients/stroke/effects and merging overlapping same-color shapes within
 * that layer.
 *
 * @param {object} canvas
 * @param {'simple'|'advanced'} newTier
 */
export function convertTier(canvas, newTier) {
  if (canvas.tier === newTier) return;
  if (newTier === 'advanced') {
    canvas.tier = 'advanced';
    if (canvas.layers.length === 0) addLayer(canvas);
    clampActiveLayer(canvas);
    return;
  }
  canvas.tier = 'simple';
  for (const layer of canvas.layers) collapseLayerToAutoGrids(canvas, layer);
  refreshActiveGrid(canvas);
}

/**
 * Resizes the canvas to newWidth x newHeight relative to `anchor`. Every
 * shape (Grid) in every layer/frame just has its offset shifted by the same
 * delta — a Grid is always independently positioned/auto-cropped (there's
 * no "full-canvas" special case to resize in step, the way a pre-migration
 * full-canvas Layer had), matching how a non-full-canvas layer's offset used
 * to shift under the old model.
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
    for (const frame of layer.frames) {
      for (const grid of frame.grids) {
        grid.offsetX += deltaX;
        grid.offsetY += deltaY;
      }
    }
  }
  canvas.width = newWidth;
  canvas.height = newHeight;
}

/**
 * Shifts every Grid in one layer's one frame by (dx, dy) — the Pixel-tier/
 * Glyph-mode nudge target ("move this whole layer's content"), the same
 * translation `resizeCanvas` applies canvas-wide, scoped down to a single
 * layer/frame instead of every layer/frame.
 *
 * @param {object} canvas
 * @param {string} layerId
 * @param {number} frameIndex
 * @param {number} dx
 * @param {number} dy
 */
export function nudgeLayerFrame(canvas, layerId, frameIndex, dx, dy) {
  const layer = canvas.layers.find((l) => l.id === layerId);
  const frame = layer?.frames[frameIndex];
  if (!frame) return;
  for (const grid of frame.grids) {
    grid.offsetX += dx;
    grid.offsetY += dy;
  }
}

// --- Flip/rotate (Checkpoint 6) ---
//
// Layer-level transforms the whole layer as one unit around the canvas's
// shared axis (not each shape around its own center) — matches Photoshop/
// Aseprite's "flip layer." Each grid's own buffer mirrors/rotates via the
// shared Grid.js primitive; its offset repositions against the CANVAS's
// width/height (not its own), so relative shape positions move together.
// This is a genuine axis-remap, not a translation (unlike resizeCanvas's
// anchor-shift): flip mirrors offset across the canvas's far edge; rotate
// derives from mapping the grid's corner through the same point-rotation
// the pixel-index remap above uses, applied to canvas-space coordinates.
// Canvas-level applies the same per-layer transform to every layer for one
// frame (resizeCanvas's own every-layer sweep, scoped to one frame here);
// the caller swaps canvas.width/height once, after every frame is done —
// see state/store.js, which also owns the "this frame vs all frames" loop.

/** @param {object} canvas @param {string} layerId @param {number} frameIndex */
export function flipLayerFrameH(canvas, layerId, frameIndex) {
  const layer = canvas.layers.find((l) => l.id === layerId);
  const frame = layer?.frames[frameIndex];
  if (!frame) return;
  for (const grid of frame.grids) {
    grid.pixels = flipPixelsH(grid.width, grid.height, grid.pixels);
    grid.offsetX = canvas.width - grid.offsetX - grid.width;
  }
}

/** @see flipLayerFrameH */
export function flipLayerFrameV(canvas, layerId, frameIndex) {
  const layer = canvas.layers.find((l) => l.id === layerId);
  const frame = layer?.frames[frameIndex];
  if (!frame) return;
  for (const grid of frame.grids) {
    grid.pixels = flipPixelsV(grid.width, grid.height, grid.pixels);
    grid.offsetY = canvas.height - grid.offsetY - grid.height;
  }
}

/**
 * Rotates every Grid in one layer's one frame 90° clockwise, repositioning
 * each against canvas.height/canvas.width (not the layer's/grid's own) so
 * the whole layer rotates as one unit. Does not touch canvas.width/height
 * itself — the caller does that once, after every targeted frame/layer has
 * been rotated (see rotateCanvasFrame90 and state/store.js).
 */
export function rotateLayerFrame90(canvas, layerId, frameIndex) {
  const layer = canvas.layers.find((l) => l.id === layerId);
  const frame = layer?.frames[frameIndex];
  if (!frame) return;
  for (const grid of frame.grids) {
    const { width, height, pixels } = rotatePixels90(grid.width, grid.height, grid.pixels);
    const newOffsetX = canvas.height - grid.offsetY - grid.height;
    const newOffsetY = grid.offsetX;
    grid.width = width;
    grid.height = height;
    grid.pixels = pixels;
    grid.offsetX = newOffsetX;
    grid.offsetY = newOffsetY;
  }
}

/** Canvas-level: applies flipLayerFrameH to every layer for one frame. */
export function flipCanvasFrameH(canvas, frameIndex) {
  for (const layer of canvas.layers) flipLayerFrameH(canvas, layer.id, frameIndex);
}

/** @see flipCanvasFrameH */
export function flipCanvasFrameV(canvas, frameIndex) {
  for (const layer of canvas.layers) flipLayerFrameV(canvas, layer.id, frameIndex);
}

/** Canvas-level: applies rotateLayerFrame90 to every layer for one frame. Does not swap canvas.width/height — see rotateLayerFrame90. */
export function rotateCanvasFrame90(canvas, frameIndex) {
  for (const layer of canvas.layers) rotateLayerFrame90(canvas, layer.id, frameIndex);
}

/**
 * Reads the composited color at a canvas-space cell — whichever visible
 * layer nearest the top (end of `layers`), and within it whichever visible
 * shape nearest its own top, has that cell set. Used by tools that need to
 * know "what's here" (eyedropper, bucket fill, selection extract) without
 * caring how many layers or shapes are actually involved.
 *
 * @param {object} canvas
 * @param {number} x
 * @param {number} y
 * @returns {string|null} a solid fill color, or null if the cell is empty/out of bounds
 */
export function colorAt(canvas, x, y) {
  const frameIndex = currentFrameIndex(canvas);
  for (let i = canvas.layers.length - 1; i >= 0; i--) {
    const layer = canvas.layers[i];
    const frame = layer.frames[frameIndex];
    if (!frame.visible) continue;
    const grid = topGridAt(frame, x, y);
    if (grid) return typeof grid.style.fill === 'string' ? grid.style.fill : null;
  }
  return null;
}

// --- Animation (Phase 7): frames.length kept uniform across every layer ---

/**
 * Inserts one new blank frame into every layer at `index` (defaulting to
 * right after the currently active frame) and makes it active. The one
 * invariant every frame operation here maintains: every layer's `frames`
 * array is always exactly `canvas.frameCount` long, in lockstep.
 *
 * @param {object} canvas
 * @param {number} [index]
 */
export function addFrame(canvas, index) {
  const insertAt = index ?? currentFrameIndex(canvas) + 1;
  for (const layer of canvas.layers) {
    layer.frames.splice(insertAt, 0, { visible: true, grids: [] });
  }
  canvas.frameDurations.splice(insertAt, 0, defaultFrameDurationMs(canvas));
  canvas.frameCount++;
  canvas.activeFrame = insertAt;
  // The new frame has no shapes yet, so this is always null — no need for
  // the id/style-matching machinery here.
  canvas.activeGridId = null;
}

/**
 * Inserts a copy of frame `index` directly after it, in every layer, and
 * makes the copy active. The copy's duration matches the source frame's
 * (an exact duplicate, timing included) rather than resetting to the
 * canvas's default; each layer's per-frame visibility copies the same way.
 * Each copied shape **keeps its source's id** (only its own pixel buffer and
 * style are independently cloned) — this is exactly the case
 * `resolveActiveGrid`'s id-match path exists for, so the previously active
 * shape (if any) stays selected in the new frame.
 *
 * @param {object} canvas
 * @param {number} index
 */
export function duplicateFrame(canvas, index) {
  const insertAt = index + 1;
  const activeLayer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
  const prevGrid = activeLayer?.frames[index]?.grids.find((g) => g.id === canvas.activeGridId) ?? null;
  for (const layer of canvas.layers) {
    const source = layer.frames[index];
    layer.frames.splice(insertAt, 0, {
      visible: source.visible,
      grids: source.grids.map((g) => ({ ...g, pixels: g.pixels.slice(), style: cloneLayerStyle(g.style) })),
    });
  }
  canvas.frameDurations.splice(insertAt, 0, canvas.frameDurations[index]);
  canvas.frameCount++;
  canvas.activeFrame = insertAt;
  canvas.activeGridId = resolveActiveGrid(activeLayer, insertAt, prevGrid);
}

/**
 * Removes frame `index` from every layer. No-ops if only one frame remains —
 * an animation can be trimmed down to a single frame, but never to zero.
 *
 * @param {object} canvas
 * @param {number} index
 */
export function removeFrame(canvas, index) {
  if (canvas.frameCount <= 1) return;
  for (const layer of canvas.layers) layer.frames.splice(index, 1);
  canvas.frameDurations.splice(index, 1);
  canvas.frameCount--;
  canvas.activeFrame = Math.min(canvas.activeFrame, canvas.frameCount - 1);
  refreshActiveGrid(canvas);
}

/**
 * Makes `index` the active frame — a working-session pointer move (like
 * setActiveLayerId), not a committed action. Clamped to the valid range.
 * Re-resolves `activeGridId` (see resolveActiveGrid) using the shape that
 * was active in the frame being left, so the common "scrubbing through
 * frames while adjusting one particular shape" workflow keeps that shape
 * selected instead of clearing on every step.
 *
 * @param {object} canvas
 * @param {number} index
 */
export function setActiveFrame(canvas, index) {
  const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
  const prevGrid = layer?.frames[canvas.activeFrame]?.grids.find((g) => g.id === canvas.activeGridId) ?? null;
  const newIndex = Math.max(0, Math.min(index, canvas.frameCount - 1));
  canvas.activeFrame = newIndex;
  canvas.activeGridId = resolveActiveGrid(layer, newIndex, prevGrid);
}

/**
 * Overrides frame `index`'s own duration (milliseconds), independent of the
 * canvas's default frame rate — the per-frame timing every animated export
 * (animatedSvg.js/animatedRaster.js/spriteSheet.js) reads from directly.
 * Clamped to a 1ms floor so no export ever has to divide by (or display) a
 * zero-length frame.
 *
 * @param {object} canvas
 * @param {number} index
 * @param {number} durationMs
 */
export function setFrameDuration(canvas, index, durationMs) {
  if (index < 0 || index >= canvas.frameCount) return;
  canvas.frameDurations[index] = Math.max(1, Math.round(durationMs));
}

/**
 * Sets whether `layerId` is visible in frame `frameIndex` specifically —
 * visibility is per-frame (see Layer.js), so hiding a layer in one frame
 * leaves it untouched in every other frame. The LayersPanel eye icon calls
 * this with `canvas.activeFrame`.
 *
 * @param {object} canvas
 * @param {string} layerId
 * @param {number} frameIndex
 * @param {boolean} visible
 */
export function setLayerFrameVisibility(canvas, layerId, frameIndex, visible) {
  const layer = canvas.layers.find((l) => l.id === layerId);
  if (!layer || frameIndex < 0 || frameIndex >= layer.frames.length) return;
  layer.frames[frameIndex].visible = visible;
}
