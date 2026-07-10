import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCanvas,
  paintCell,
  resizeCanvas,
  colorAt,
  addLayer,
  addGrid,
  removeLayer,
  reorderLayer,
  duplicateLayer,
  mergeLayerDown,
  eraseFromLayer,
  clampActiveLayer,
  topVisibleLayerAt,
  convertTier,
  addFrame,
  duplicateFrame,
  removeFrame,
  setActiveFrame,
  setFrameDuration,
  setLayerFrameVisibility,
  cloneLayerStyle,
  cloneFillValue,
  resolveActiveGrid,
  refreshActiveGrid,
  nudgeLayerFrame,
  flipLayerFrameH,
  flipLayerFrameV,
  rotateLayerFrame90,
  flipCanvasFrameH,
  flipCanvasFrameV,
  rotateCanvasFrame90,
} from '../../src/model/Canvas.js';

test('colorAt reads the topmost (last) visible layer that owns a cell', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 1, '#00ff00');
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(colorAt(canvas, 1, 1), '#00ff00');
  assert.equal(colorAt(canvas, 1, 0), null);
});

// resizeCanvas no longer resizes a full-canvas layer buffer — every shape
// (Grid) is independently offset/auto-cropped, so growing the canvas just
// shifts each shape's offset by the anchor delta (see "resizeCanvas shifts
// every shape's offset..." below). The delta computation itself (top-left/
// bottom-right/center, growing and shrinking) is already exercised via the
// shared anchorOffset formula in Grid.test.js's resize() tests.

test('resizeCanvas shrinking crops content relative to anchor', () => {
  const canvas = createCanvas({ width: 4, height: 4 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 3, 3, '#00ff00');
  resizeCanvas(canvas, 2, 2, 'bottom-right');
  assert.equal(canvas.width, 2);
  assert.equal(canvas.height, 2);
  // top-left content (0,0) is cropped away; bottom-right content (3,3) lands at the new (1,1)
  assert.equal(colorAt(canvas, 0, 0), null);
  assert.equal(colorAt(canvas, 1, 1), '#00ff00');
});

test('resizeCanvas center anchor keeps content centered after growth', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  resizeCanvas(canvas, 3, 3, 'center');
  assert.equal(colorAt(canvas, 1, 1), '#ff0000');
  assert.equal(colorAt(canvas, 0, 0), null);
});

test('nudgeLayerFrame shifts every shape in one layer/frame by (dx, dy)', () => {
  // Default (simple/Pixel) tier auto-manages one Grid per distinct color, so
  // two paintCell calls with different colors land two Grids in one frame —
  // a simpler way to get multiple shapes to nudge together than hand-wiring
  // advanced tier's single-active-shape paint semantics.
  const canvas = createCanvas({ width: 12, height: 12 });
  paintCell(canvas, 1, 1, '#ff0000');
  paintCell(canvas, 5, 5, '#00ff00');
  const layer = canvas.layers[0];
  assert.equal(layer.frames[0].grids.length, 2);

  nudgeLayerFrame(canvas, layer.id, 0, 2, 3);

  assert.equal(colorAt(canvas, 1, 1), null);
  assert.equal(colorAt(canvas, 3, 4), '#ff0000');
  assert.equal(colorAt(canvas, 5, 5), null);
  assert.equal(colorAt(canvas, 7, 8), '#00ff00');
});

test('nudgeLayerFrame leaves other layers and other frames untouched', () => {
  const canvas = createCanvas({ width: 6, height: 6 });
  canvas.tier = 'advanced';
  const a = addLayer(canvas, { name: 'A' });
  paintCell(canvas, 0, 0, '#ff0000'); // a's first shape, frame 0

  const b = addLayer(canvas, { name: 'B' }); // switches active layer to b
  paintCell(canvas, 1, 1, '#0000ff'); // b's first shape, frame 0

  addFrame(canvas); // frame 1 added to both layers, canvas.activeFrame -> 1
  canvas.activeFrame = 0;

  nudgeLayerFrame(canvas, b.id, 0, 2, 2);

  assert.equal(colorAt(canvas, 1, 1), null); // b's shape moved away
  assert.equal(colorAt(canvas, 3, 3), '#0000ff'); // b's shape landed here
  assert.equal(colorAt(canvas, 0, 0), '#ff0000'); // a's shape (different layer) untouched
  assert.deepEqual(b.frames[1].grids, []); // b's frame 1 (different frame) untouched
});

test('nudgeLayerFrame is a no-op for an unknown layerId', () => {
  const canvas = createCanvas({ width: 4, height: 4 });
  paintCell(canvas, 0, 0, '#ff0000');
  nudgeLayerFrame(canvas, 'does-not-exist', 0, 1, 1);
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
});

// --- Flip/rotate (Checkpoint 6): layer/canvas-level offset-remap math ---
// (Grids are constructed directly rather than via paintCell, since advanced
// tier's paintCell reuses one active Grid across separate paint calls
// rather than creating a second one — see the Checkpoint 2 nudge tests'
// own note on this. Direct construction gives full control over each
// grid's exact offset/width/height for these offset-math assertions.)

function makeTestGrid(id, offsetX, offsetY, width, height, fill) {
  return { id, name: id, offsetX, offsetY, width, height, pixels: new Uint8Array(width * height).fill(1), style: { fill, effects: [] }, visible: true, locked: false, opacity: 1 };
}

test('flipLayerFrameH mirrors every grid in one layer/frame against canvas.width, offsetY untouched', () => {
  const canvas = createCanvas({ width: 10, height: 6 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas);
  const grid = makeTestGrid('g1', 2, 1, 3, 2, '#ff0000');
  layer.frames[0].grids.push(grid);

  flipLayerFrameH(canvas, layer.id, 0);

  assert.equal(grid.offsetX, 10 - 2 - 3); // 5
  assert.equal(grid.offsetY, 1); // unchanged
  assert.equal(grid.width, 3);
  assert.equal(grid.height, 2);
});

test('flipLayerFrameV mirrors every grid in one layer/frame against canvas.height, offsetX untouched', () => {
  const canvas = createCanvas({ width: 10, height: 6 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas);
  const grid = makeTestGrid('g1', 2, 1, 3, 2, '#ff0000');
  layer.frames[0].grids.push(grid);

  flipLayerFrameV(canvas, layer.id, 0);

  assert.equal(grid.offsetX, 2); // unchanged
  assert.equal(grid.offsetY, 6 - 1 - 2); // 3
});

test('rotateLayerFrame90 repositions each grid against canvas dimensions (not its own), swapping its own width/height', () => {
  const canvas = createCanvas({ width: 10, height: 6 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas);
  const grid = makeTestGrid('g1', 2, 1, 4, 2, '#ff0000');
  layer.frames[0].grids.push(grid);

  rotateLayerFrame90(canvas, layer.id, 0);

  assert.equal(grid.width, 2); // old height
  assert.equal(grid.height, 4); // old width
  assert.equal(grid.offsetX, 6 - 1 - 2); // canvas.height - old offsetY - old height = 3
  assert.equal(grid.offsetY, 2); // old offsetX
  // canvas itself is untouched here — swapping width/height is the caller's job (state/store.js)
  assert.equal(canvas.width, 10);
  assert.equal(canvas.height, 6);
});

test('flipCanvasFrameH applies to every layer for one frame', () => {
  const canvas = createCanvas({ width: 10, height: 10 });
  canvas.tier = 'advanced';
  const a = addLayer(canvas, { name: 'A' });
  a.frames[0].grids.push(makeTestGrid('ga', 1, 1, 1, 1, '#ff0000'));
  const b = addLayer(canvas, { name: 'B' });
  b.frames[0].grids.push(makeTestGrid('gb', 5, 2, 1, 1, '#00ff00'));

  flipCanvasFrameH(canvas, 0);

  assert.equal(a.frames[0].grids[0].offsetX, 10 - 1 - 1); // 8
  assert.equal(b.frames[0].grids[0].offsetX, 10 - 5 - 1); // 4
});

test('rotateCanvasFrame90 repositions every layer\'s grids for one frame, leaving canvas.width/height for the caller to swap', () => {
  const canvas = createCanvas({ width: 10, height: 6 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas);
  layer.frames[0].grids.push(makeTestGrid('g1', 2, 1, 1, 1, '#ff0000'));

  rotateCanvasFrame90(canvas, 0);

  assert.equal(canvas.width, 10);
  assert.equal(canvas.height, 6);
  const grid = layer.frames[0].grids[0];
  assert.equal(grid.offsetX, 6 - 1 - 1); // 4
  assert.equal(grid.offsetY, 2);
});

// --- Advanced tier ---

test('addLayer appends a new, empty (no shapes yet) layer and makes it active', () => {
  const canvas = createCanvas({ width: 3, height: 3 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'Sky' });
  assert.equal(canvas.layers.length, 1);
  assert.equal(canvas.activeLayerId, layer.id);
  assert.equal(layer.name, 'Sky');
  assert.deepEqual(layer.frames[0].grids, []);
  assert.equal(canvas.activeGridId, null); // nothing to select yet — first paint creates a shape
});

// "paints/erases into the active layer, growing it as needed" is covered
// further down by "advanced-tier paintCell creates a Grid on first paint,
// grows it as the stroke extends, and shrinks/removes it on full erase".

test('advanced-tier paintCell is a no-op with no active layer', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  paintCell(canvas, 0, 0, '#ff0000'); // no layers exist yet
  assert.equal(canvas.layers.length, 0);
});

test('advanced-tier paintCell is a no-op on a locked layer (layer.locked, distinct from a locked Grid)', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas);
  layer.locked = true;
  paintCell(canvas, 0, 0, '#ff0000');
  assert.deepEqual(layer.frames[0].grids, []);
});

test('removeLayer drops the layer and re-clamps activeLayerId to the topmost remaining layer', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const a = addLayer(canvas, { name: 'A' });
  const b = addLayer(canvas, { name: 'B' });
  removeLayer(canvas, b.id);
  assert.equal(canvas.layers.length, 1);
  assert.equal(canvas.activeLayerId, a.id);
  removeLayer(canvas, a.id);
  assert.equal(canvas.activeLayerId, null);
});

test('reorderLayer swaps a layer with its neighbor and no-ops past either end', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const a = addLayer(canvas, { name: 'A' });
  const b = addLayer(canvas, { name: 'B' });
  reorderLayer(canvas, a.id, 1);
  assert.deepEqual(canvas.layers.map((l) => l.id), [b.id, a.id]);
  reorderLayer(canvas, a.id, 1); // already at the front; no-op
  assert.deepEqual(canvas.layers.map((l) => l.id), [b.id, a.id]);
  reorderLayer(canvas, b.id, -1); // already at the back; no-op
  assert.deepEqual(canvas.layers.map((l) => l.id), [b.id, a.id]);
});

test('clampActiveLayer falls back to the topmost layer when the current id no longer exists', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const a = addLayer(canvas, { name: 'A' });
  const b = addLayer(canvas, { name: 'B' });
  canvas.activeLayerId = 'stale-id';
  clampActiveLayer(canvas);
  assert.equal(canvas.activeLayerId, b.id);
  canvas.layers = [];
  clampActiveLayer(canvas);
  assert.equal(canvas.activeLayerId, null);
  void a;
});

test('topVisibleLayerAt finds the topmost visible layer covering a cell, skipping hidden layers', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const a = addLayer(canvas, { name: 'A' });
  paintCell(canvas, 0, 0, '#f00');
  const b = addLayer(canvas, { name: 'B' });
  paintCell(canvas, 0, 0, '#0f0');
  assert.equal(topVisibleLayerAt(canvas, 0, 0), b);
  b.frames[0].visible = false;
  assert.equal(topVisibleLayerAt(canvas, 0, 0), a);
  assert.equal(topVisibleLayerAt(canvas, 1, 1), null);
});

// "convertTier simple -> advanced flips autoManaged off..." (the
// retired-flag assertion) and "...advanced -> simple rebuilds one
// auto-managed layer per composited color..." are both superseded further
// down by "convertTier simple -> advanced just flips the tier flag..." and
// "convertTier advanced -> simple rebuilds a single style-scanned layer...".

test('convertTier simple -> advanced on a blank canvas creates one empty layer, active, with no shapes yet', () => {
  // Behavior change, not just a shape change: the pre-migration version of
  // this test expected a solid-black-filled layer. addLayer no longer
  // creates any style/fill at all (style lives on Grid, created lazily on
  // first paint — see docs/data-model.md section 1), so converting a blank
  // canvas now leaves a genuinely empty, unpainted layer.
  const canvas = createCanvas({ width: 2, height: 2 });
  assert.equal(canvas.layers.length, 0);
  convertTier(canvas, 'advanced');
  assert.equal(canvas.tier, 'advanced');
  assert.equal(canvas.layers.length, 1);
  assert.deepEqual(canvas.layers[0].frames[0].grids, []);
  assert.equal(canvas.activeLayerId, canvas.layers[0].id);
  assert.equal(canvas.activeGridId, null);
  assert.equal(colorAt(canvas, 0, 0), null);
});

test('convertTier is a no-op when already at the requested tier', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  const before = canvas.layers;
  convertTier(canvas, 'simple');
  assert.equal(canvas.layers, before);
});

// --- duplicateLayer / mergeLayerDown / eraseFromLayer ---

// "duplicateLayer copies content/style independently and inserts directly
// above the original, active" is superseded further down by "duplicateLayer
// gives each copied shape a fresh id... and clones pixels/style
// independently", which additionally covers the id-freshness Grid.id needs
// that the pre-migration Layer-level test had no equivalent of.

test('duplicateLayer returns null for an unknown layer id', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  assert.equal(duplicateLayer(canvas, 'nope'), null);
});

test('duplicateLayer copies a shape\'s gradient fill independently (stops are a nested array, not shallow-copy-safe)', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const original = addLayer(canvas, { name: 'Gradient' });
  paintCell(canvas, 0, 0, '#ffffff');
  const grid = original.frames[0].grids[0];
  grid.style.fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };

  const copy = duplicateLayer(canvas, original.id);
  const copiedGrid = copy.frames[0].grids[0];
  assert.deepEqual(copiedGrid.style.fill, grid.style.fill);
  assert.notEqual(copiedGrid.style.fill, grid.style.fill);

  copiedGrid.style.fill.stops[0].color = '#123456';
  assert.equal(grid.style.fill.stops[0].color, '#fff');
});

test('cloneFillValue clones a gradient\'s stops independently, and passes any fill without its own .stops array through as a shallow copy', () => {
  const gradient = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }] };
  const clonedGradient = cloneFillValue(gradient);
  assert.deepEqual(clonedGradient, gradient);
  clonedGradient.stops[0].color = '#000';
  assert.equal(gradient.stops[0].color, '#fff');

  // Any future object fill kind with no nested array like a gradient's
  // stops still round-trips safely as a shallow copy.
  const flatFill = { type: 'future-kind', value: 42 };
  assert.deepEqual(cloneFillValue(flatFill), flatFill);
  assert.notEqual(cloneFillValue(flatFill), flatFill);

  assert.equal(cloneFillValue('#ff0000'), '#ff0000');
  assert.equal(cloneFillValue(null), null);
});

test('cloneLayerStyle handles every fill kind (solid/gradient/none) without throwing', () => {
  for (const fill of ['#ff0000', { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }] }, null]) {
    const style = { fill, stroke: undefined, effects: [] };
    assert.deepEqual(cloneLayerStyle(style), style);
  }
});

// "mergeLayerDown combines pixel data across different offsets/sizes and
// keeps the bottom layer's id/name/style" described the pre-migration
// bounding-box+pixel-OR+bottom-wins-style merge, which layer merges no
// longer do at all (see docs/data-model.md section 3a — layer merge is now
// pure per-frame concatenation, each shape keeping its own style). That
// bounding-box+pixel-OR+bottom-wins behavior still exists, just moved to
// *shape* merges (Grid.js's mergeGridDown) — see Grid.test.js's "mergeGridDown
// ORs two shapes' pixels..." test. Layer-merge coverage is further down:
// "mergeLayerDown concatenates shapes per frame...".

test('mergeLayerDown no-ops when the layer is already at the bottom of the stack', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const only = addLayer(canvas, { name: 'Only' });
  mergeLayerDown(canvas, only.id);
  assert.equal(canvas.layers.length, 1);
  assert.equal(canvas.layers[0], only);
});

// "eraseFromLayer clears a cell from a specific layer regardless of
// activeLayerId, and no-ops on a locked layer" is superseded further down by
// "eraseFromLayer clears from whichever unlocked shape in that layer's
// active frame owns the cell, shrinking/removing it, regardless of
// activeLayerId".

// --- Animation (Phase 7): frame add/remove/duplicate ---

// "addFrame inserts a blank frame into every layer, keeping frameCount
// uniform, and makes it active" is superseded further down by "addFrame
// inserts an empty-grids frame into every layer...".

test('addFrame inserts at a given explicit index, shifting later frames back', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, {});
  paintCell(canvas, 0, 0, '#ff0000'); // frame 0
  addFrame(canvas); // frame 1, now active
  paintCell(canvas, 1, 1, '#00ff00'); // frame 1

  addFrame(canvas, 1); // insert a blank frame between 0 and (old) 1

  assert.equal(layer.frames.length, 3);
  assert.equal(layer.frames[0].grids.length, 1); // original frame 0 untouched
  assert.equal(layer.frames[0].grids[0].style.fill, '#ff0000');
  assert.deepEqual(layer.frames[1].grids, []); // new blank frame
  assert.equal(layer.frames[2].grids.length, 1); // old frame 1 shifted to index 2
  assert.equal(layer.frames[2].grids[0].style.fill, '#00ff00');
  assert.equal(canvas.activeFrame, 1);
});

// "duplicateFrame copies every layer's frame at index, inserting the copy
// right after it" is superseded further down by "duplicateFrame copies
// every layer's frame at index (shapes included, ids preserved)...".

test('addFrame\'s new frame defaults to visible; duplicateFrame\'s copy carries over the source frame\'s visibility', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, {});
  layer.frames[0].visible = false;

  addFrame(canvas); // frame 1
  assert.equal(layer.frames[1].visible, true, 'a newly-added frame defaults to visible regardless of other frames');

  duplicateFrame(canvas, 0); // copies frame 0 (hidden) to index 1
  assert.equal(layer.frames[1].visible, false, 'duplicateFrame copies the source frame\'s own visibility');
});

test('setLayerFrameVisibility toggles visibility for one frame only, leaving other frames of the same layer untouched', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, {});
  addFrame(canvas); // frame 1

  setLayerFrameVisibility(canvas, layer.id, 0, false);
  assert.equal(layer.frames[0].visible, false);
  assert.equal(layer.frames[1].visible, true);

  setLayerFrameVisibility(canvas, layer.id, 1, false);
  assert.equal(layer.frames[1].visible, false);
});

// "paintCell no-ops on a layer hidden in the active frame..." and
// "removeFrame removes the frame from every layer and clamps activeFrame"
// are both superseded further down by their Grid-shape equivalents of the
// same names.

test('removeFrame refuses to remove the last remaining frame', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, {});
  removeFrame(canvas, 0);
  assert.equal(canvas.frameCount, 1);
  assert.equal(layer.frames.length, 1);
});

test('setActiveFrame clamps to the valid range', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  addFrame(canvas);
  setActiveFrame(canvas, 5);
  assert.equal(canvas.activeFrame, 1);
  setActiveFrame(canvas, -3);
  assert.equal(canvas.activeFrame, 0);
});

// "paintCell targets only the active frame, leaving other frames of the
// same layer untouched" and "mergeLayerDown merges frame-by-frame, keeping
// bottom's frameCount" are both superseded further down by their Grid-shape
// equivalents of the same names.

test('colorAt/topVisibleLayerAt read from the active frame\'s own shapes, not always frame 0', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'A' });
  addFrame(canvas); // frame 1, active
  paintCell(canvas, 0, 0, '#ff0000'); // paints frame 1's own shape only

  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(topVisibleLayerAt(canvas, 0, 0), layer);

  setActiveFrame(canvas, 0);
  assert.equal(colorAt(canvas, 0, 0), null); // frame 0 has no shapes of its own
  assert.equal(topVisibleLayerAt(canvas, 0, 0), null);
});

test('addLayer creates a new layer with canvas.frameCount frames, not always 1', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  addFrame(canvas);
  addFrame(canvas);
  const layer = addLayer(canvas, {});
  assert.equal(layer.frames.length, 3);
});

// --- Animation (Phase 7 follow-on): per-frame duration ---

test('a new canvas starts with one frameDurations entry derived from the default frame rate', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  assert.deepEqual(canvas.frameDurations, [Math.round(1000 / canvas.frameRate)]);
});

test('addFrame inserts a default-duration entry into frameDurations at the same index as the new frame', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  setFrameDuration(canvas, 0, 250);
  addFrame(canvas, 1); // insert after frame 0
  assert.deepEqual(canvas.frameDurations, [250, Math.round(1000 / canvas.frameRate)]);
});

test('duplicateFrame copies the source frame\'s own duration, not the default', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  setFrameDuration(canvas, 0, 500);
  duplicateFrame(canvas, 0);
  assert.deepEqual(canvas.frameDurations, [500, 500]);
});

test('removeFrame removes the matching frameDurations entry, keeping it aligned with the remaining frames', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  addFrame(canvas); // frame 1
  addFrame(canvas); // frame 2
  setFrameDuration(canvas, 0, 100);
  setFrameDuration(canvas, 1, 200);
  setFrameDuration(canvas, 2, 300);
  removeFrame(canvas, 1);
  assert.deepEqual(canvas.frameDurations, [100, 300]);
});

test('setFrameDuration overrides one frame\'s duration, clamped to a 1ms floor, and no-ops out of range', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  addFrame(canvas);
  setFrameDuration(canvas, 1, 400);
  assert.deepEqual(canvas.frameDurations, [Math.round(1000 / canvas.frameRate), 400]);

  setFrameDuration(canvas, 0, -50);
  assert.equal(canvas.frameDurations[0], 1);

  setFrameDuration(canvas, 5, 999); // out of range — no-op
  assert.equal(canvas.frameDurations.length, 2);
});

// --- Session 1: Layer/Frame/Grid redesign (see docs/data-model.md) ---

test('advanced-tier paintCell creates a Grid on first paint, grows it as the stroke extends, and shrinks/removes it on full erase', () => {
  const canvas = createCanvas({ width: 5, height: 5 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas);
  paintCell(canvas, 2, 2, '#ff0000');
  const frame = layer.frames[0];
  assert.equal(frame.grids.length, 1);
  const grid = frame.grids[0];
  assert.equal(canvas.activeGridId, grid.id);
  assert.equal(grid.offsetX, 2);
  assert.equal(grid.offsetY, 2);
  assert.equal(grid.width, 1);
  assert.equal(grid.height, 1);
  assert.equal(grid.style.fill, '#ff0000');

  paintCell(canvas, 4, 0, '#ff0000'); // same active grid grows to include this new point
  assert.equal(frame.grids.length, 1);
  assert.equal(grid.offsetX, 2);
  assert.equal(grid.offsetY, 0);
  assert.equal(grid.width, 3);
  assert.equal(grid.height, 3);
  assert.equal(colorAt(canvas, 2, 2), '#ff0000');
  assert.equal(colorAt(canvas, 4, 0), '#ff0000');

  paintCell(canvas, 4, 0, null);
  assert.equal(frame.grids.length, 1); // still owns (2,2) — shrunk, not removed
  assert.equal(colorAt(canvas, 4, 0), null);
  assert.equal(colorAt(canvas, 2, 2), '#ff0000');

  paintCell(canvas, 2, 2, null);
  assert.equal(frame.grids.length, 0); // fully erased -> GC'd
  assert.equal(canvas.activeGridId, null);
});

test('advanced-tier paintCell no-ops (paint and erase) when the active Grid is locked', () => {
  const canvas = createCanvas({ width: 3, height: 3 });
  canvas.tier = 'advanced';
  addLayer(canvas);
  paintCell(canvas, 0, 0, '#ff0000');
  const grid = canvas.layers[0].frames[0].grids[0];
  grid.locked = true;

  paintCell(canvas, 1, 1, '#ff0000');
  assert.equal(grid.width, 1);
  assert.equal(grid.height, 1);

  paintCell(canvas, 0, 0, null);
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
});

test('mergeLayerDown concatenates shapes per frame (bottom stays back, top stays front), preserving each shape\'s own style', () => {
  const canvas = createCanvas({ width: 4, height: 4 });
  canvas.tier = 'advanced';
  const bottom = addLayer(canvas, { name: 'Bottom' });
  paintCell(canvas, 0, 0, '#0000ff');
  const top = addLayer(canvas, { name: 'Top' });
  paintCell(canvas, 3, 3, '#ff0000');

  mergeLayerDown(canvas, top.id);

  assert.equal(canvas.layers.length, 1);
  const merged = canvas.layers[0];
  assert.equal(merged.id, bottom.id);
  assert.equal(merged.frames[0].grids.length, 2);
  assert.equal(merged.frames[0].grids[0].style.fill, '#0000ff'); // bottom's shape stays first (back)
  assert.equal(merged.frames[0].grids[1].style.fill, '#ff0000'); // top's shape stays last (front)
  assert.equal(colorAt(canvas, 0, 0), '#0000ff');
  assert.equal(colorAt(canvas, 3, 3), '#ff0000');
});

test('mergeLayerDown dedupes same-color Grids left over from two Simple/Pixel-tier layers, but not in Advanced/Shape tier', () => {
  const simple = createCanvas({ width: 4, height: 4 });
  const bottom = addLayer(simple);
  simple.activeLayerId = bottom.id;
  paintCell(simple, 0, 0, '#ff0000'); // bottom's own auto-managed red Grid
  const top = addLayer(simple);
  simple.activeLayerId = top.id;
  paintCell(simple, 3, 3, '#ff0000'); // top's own auto-managed red Grid — same color, different layer

  mergeLayerDown(simple, top.id);

  const merged = simple.layers[0];
  assert.equal(merged.frames[0].grids.length, 1); // the two red Grids folded into one
  assert.equal(colorAt(simple, 0, 0), '#ff0000');
  assert.equal(colorAt(simple, 3, 3), '#ff0000');

  const advanced = createCanvas({ width: 4, height: 4 });
  advanced.tier = 'advanced';
  addLayer(advanced, { name: 'Bottom' });
  paintCell(advanced, 0, 0, '#ff0000');
  const advTop = addLayer(advanced, { name: 'Top' });
  paintCell(advanced, 3, 3, '#ff0000');

  mergeLayerDown(advanced, advTop.id);

  assert.equal(advanced.layers[0].frames[0].grids.length, 2); // Advanced/Shape tier keeps them separate
});

test('mergeLayerDown translates a hidden top-frame\'s visibility onto each of its incoming shapes', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'Bottom' });
  paintCell(canvas, 0, 0, '#0000ff');
  const top = addLayer(canvas, { name: 'Top' });
  paintCell(canvas, 1, 1, '#ff0000');
  top.frames[0].visible = false;

  mergeLayerDown(canvas, top.id);

  const merged = canvas.layers[0];
  assert.equal(merged.frames[0].visible, true); // bottom's own frame visibility wins for the merged layer
  const incoming = merged.frames[0].grids.find((g) => g.style.fill === '#ff0000');
  assert.equal(incoming.visible, false);
});

test('mergeLayerDown merges frame-by-frame, keeping bottom\'s frameCount', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'bottom' });
  paintCell(canvas, 0, 0, '#0000ff');
  addFrame(canvas); // frame 1
  paintCell(canvas, 1, 1, '#0000ff');
  const top = addLayer(canvas, { name: 'top' }); // active, 2 frames (matches canvas.frameCount)
  setActiveFrame(canvas, 0);
  paintCell(canvas, 1, 0, '#ff0000');
  setActiveFrame(canvas, 1);
  paintCell(canvas, 0, 1, '#ff0000');

  mergeLayerDown(canvas, top.id);

  assert.equal(canvas.layers.length, 1);
  const merged = canvas.layers[0];
  assert.equal(merged.frames.length, 2);
  assert.equal(merged.frames[0].grids.length, 2);
  assert.equal(merged.frames[1].grids.length, 2);
});

test('colorAt/topVisibleLayerAt respect a layer\'s own shape stacking order, not just layer order', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas);
  paintCell(canvas, 0, 0, '#0000ff'); // shape A
  canvas.activeGridId = null; // force a new shape rather than growing shape A
  paintCell(canvas, 0, 0, '#ff0000'); // shape B, painted on top at the same cell
  assert.equal(layer.frames[0].grids.length, 2);
  assert.equal(colorAt(canvas, 0, 0), '#ff0000'); // topmost (last) shape wins
  assert.equal(topVisibleLayerAt(canvas, 0, 0), layer);

  layer.frames[0].grids[1].visible = false; // hide shape B
  assert.equal(colorAt(canvas, 0, 0), '#0000ff'); // falls through to shape A
});

test('duplicateLayer gives each copied shape a fresh id (not preserved, unlike duplicateFrame) and clones pixels/style independently', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const original = addLayer(canvas, { name: 'Base' });
  paintCell(canvas, 0, 0, '#ff0000');
  const originalGridId = original.frames[0].grids[0].id;

  const copy = duplicateLayer(canvas, original.id);
  assert.equal(copy.frames[0].grids.length, 1);
  assert.notEqual(copy.frames[0].grids[0].id, originalGridId);
  assert.equal(copy.frames[0].grids[0].style.fill, '#ff0000');
  assert.notEqual(copy.frames[0].grids[0].style, original.frames[0].grids[0].style);

  copy.frames[0].grids[0].pixels[0] = 0;
  assert.equal(original.frames[0].grids[0].pixels[0], 1);
});

test('eraseFromLayer clears from whichever unlocked shape in that layer\'s active frame owns the cell, shrinking/removing it, regardless of activeLayerId', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'A' });
  paintCell(canvas, 0, 0, '#ff0000');
  addLayer(canvas, { name: 'B' }); // becomes active; `layer` is no longer canvas.activeLayerId
  eraseFromLayer(canvas, layer, 0, 0);
  assert.equal(layer.frames[0].grids.length, 0); // fully erased -> GC'd

  const layerB = canvas.layers[1];
  paintCell(canvas, 0, 0, '#00ff00');
  const bGrid = layerB.frames[0].grids[0];
  bGrid.locked = true;
  eraseFromLayer(canvas, layerB, 0, 0);
  assert.equal(bGrid.pixels[0], 1); // untouched — locked
});

test('resizeCanvas shifts every shape\'s offset by the anchor delta, without touching its own pixels', () => {
  const canvas = createCanvas({ width: 6, height: 6 });
  canvas.tier = 'advanced';
  addLayer(canvas);
  paintCell(canvas, 0, 0, '#ff0000');
  const grid = canvas.layers[0].frames[0].grids[0];

  resizeCanvas(canvas, 6, 6, 'top-left'); // same size, top-left anchor: no shift
  assert.equal(grid.offsetX, 0);
  assert.equal(grid.offsetY, 0);
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');

  resizeCanvas(canvas, 8, 8, 'bottom-right'); // grows away from top-left, shifting content right/down
  assert.equal(grid.offsetX, 2);
  assert.equal(grid.offsetY, 2);
  assert.equal(colorAt(canvas, 2, 2), '#ff0000');
});

test('convertTier simple -> advanced just flips the tier flag on the existing single layer (no auto-managed flag anymore)', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  const layerId = canvas.layers[0].id;
  convertTier(canvas, 'advanced');
  assert.equal(canvas.tier, 'advanced');
  assert.equal(canvas.layers.length, 1);
  assert.equal(canvas.layers[0].id, layerId);
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(canvas.activeLayerId, layerId);
});

test('convertTier simple -> advanced activates the active layer\'s shape matching activeColor', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 0, '#00ff00');
  const greenGrid = canvas.layers[0].frames[0].grids.find((g) => g.style.fill === '#00ff00');

  convertTier(canvas, 'advanced', '#00ff00');

  assert.equal(canvas.activeGridId, greenGrid.id);
});

test('convertTier simple -> advanced falls back to the default active grid when activeColor has no matching shape on this layer', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  const redGrid = canvas.layers[0].frames[0].grids[0];

  convertTier(canvas, 'advanced', '#0000ff'); // never painted on this layer

  assert.equal(canvas.activeGridId, redGrid.id); // falls back to the layer's only shape
});

test('convertTier advanced -> simple collapses each layer\'s own shapes independently, preserving layer count/order/names', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  const solidLayer = addLayer(canvas, { name: 'solid' });
  paintCell(canvas, 0, 0, '#ff0000');
  const gradientLayer = addLayer(canvas, { name: 'gradient' });
  paintCell(canvas, 1, 0, '#00ff00');
  gradientLayer.frames[0].grids[0].style.fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };

  convertTier(canvas, 'simple');

  assert.equal(canvas.tier, 'simple');
  assert.equal(canvas.layers.length, 2); // layer count preserved, not flattened to one
  assert.deepEqual(canvas.layers.map((l) => l.name), ['solid', 'gradient']); // order/names preserved
  assert.equal(canvas.layers[0].id, solidLayer.id);
  assert.equal(canvas.layers[1].id, gradientLayer.id);
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(colorAt(canvas, 1, 0), null); // gradient cell has no simple-tier equivalent, dropped
});

test('convertTier advanced -> simple preserves each layer\'s lock/opacity/per-frame visibility', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'A' });
  paintCell(canvas, 0, 0, '#ff0000');
  layer.locked = true;
  layer.opacity = 0.5;
  layer.frames[0].visible = false;

  convertTier(canvas, 'simple');

  assert.equal(canvas.layers[0].locked, true);
  assert.equal(canvas.layers[0].opacity, 0.5);
  assert.equal(canvas.layers[0].frames[0].visible, false);
});

test('convertTier advanced -> simple merges overlapping same-color shapes within a layer into one Grid', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'A' });
  paintCell(canvas, 0, 0, '#ff0000');
  const second = addGrid(canvas, canvas.activeLayerId);
  second.style.fill = '#ff0000'; // a second, independent red shape in the same layer
  paintCell(canvas, 1, 0, '#ff0000');

  convertTier(canvas, 'simple');

  assert.equal(canvas.layers[0].frames[0].grids.length, 1); // both red shapes merged into one
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(colorAt(canvas, 1, 0), '#ff0000');
});

test('addFrame inserts an empty-grids frame into every layer, keeping frameCount uniform, and makes it active', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const a = addLayer(canvas, { name: 'A' });
  const b = addLayer(canvas, { name: 'B' });
  paintCell(canvas, 0, 0, '#ff0000'); // paints frame 0 of the active layer (b)

  addFrame(canvas);

  assert.equal(canvas.frameCount, 2);
  assert.equal(canvas.activeFrame, 1);
  assert.equal(a.frames.length, 2);
  assert.equal(b.frames.length, 2);
  assert.deepEqual(a.frames[1].grids, []);
  assert.deepEqual(b.frames[1].grids, []);
  assert.equal(canvas.activeGridId, null);
  assert.equal(b.frames[0].grids.length, 1); // frame 0's prior content untouched
});

test('duplicateFrame copies every layer\'s frame at index (shapes included, ids preserved), inserting the copy right after it', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, {});
  paintCell(canvas, 0, 0, '#ff0000');
  const sourceGrid = layer.frames[0].grids[0];

  duplicateFrame(canvas, 0);

  assert.equal(canvas.frameCount, 2);
  assert.equal(canvas.activeFrame, 1);
  assert.equal(layer.frames[1].grids.length, 1);
  assert.equal(layer.frames[1].grids[0].id, sourceGrid.id);
  layer.frames[1].grids[0].pixels[0] = 0;
  assert.equal(layer.frames[0].grids[0].pixels[0], 1);
});

test('removeFrame removes the frame\'s shapes from every layer and clamps activeFrame', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, {});
  addFrame(canvas); // frame 1
  addFrame(canvas); // frame 2, active
  paintCell(canvas, 0, 0, '#ff0000'); // frame 2

  removeFrame(canvas, 1);

  assert.equal(canvas.frameCount, 2);
  assert.equal(layer.frames.length, 2);
  assert.equal(layer.frames[1].grids.length, 1); // old frame 2 shifted to index 1
  assert.equal(canvas.activeFrame, 1); // clamped from the stale index 2
});

test('paintCell targets only the active frame\'s own shapes, leaving other frames of the same layer untouched', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, {});
  paintCell(canvas, 0, 0, '#ff0000'); // frame 0
  addFrame(canvas); // frame 1, active
  paintCell(canvas, 1, 1, '#00ff00'); // frame 1

  assert.equal(layer.frames[0].grids.length, 1);
  assert.equal(layer.frames[1].grids.length, 1);
  assert.equal(colorAt(canvas, 0, 0), null); // active frame is 1; frame 0's content isn't composited here
  setActiveFrame(canvas, 0);
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(colorAt(canvas, 1, 1), null);
});

test('paintCell no-ops on a layer hidden in the active frame (same "can\'t be edited" contract as locked), and paints normally once shown again', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, {});
  setLayerFrameVisibility(canvas, layer.id, 0, false);

  paintCell(canvas, 0, 0, '#ff0000');
  assert.equal(layer.frames[0].grids.length, 0, 'hidden-in-this-frame blocks painting, like a locked layer');

  setLayerFrameVisibility(canvas, layer.id, 0, true);
  paintCell(canvas, 0, 0, '#ff0000');
  assert.equal(layer.frames[0].grids.length, 1);
});

test('resolveActiveGrid: id match survives when the previously active shape\'s id is still present', () => {
  const layer = { frames: [{ grids: [{ id: 'g1', style: { fill: '#f00', effects: [] } }, { id: 'g2', style: { fill: '#0f0', effects: [] } }] }] };
  const prevGrid = { id: 'g2', style: { fill: '#0f0', effects: [] } };
  assert.equal(resolveActiveGrid(layer, 0, prevGrid), 'g2');
});

test('resolveActiveGrid: falls back to a style match when the id no longer exists', () => {
  const layer = { frames: [{ grids: [{ id: 'g3', style: { fill: '#0f0', effects: [] } }] }] };
  const prevGrid = { id: 'stale', style: { fill: '#0f0', effects: [] } };
  assert.equal(resolveActiveGrid(layer, 0, prevGrid), 'g3');
});

test('resolveActiveGrid: falls back to the first shape when neither id nor style match', () => {
  const layer = { frames: [{ grids: [{ id: 'g4', style: { fill: '#000', effects: [] } }, { id: 'g5', style: { fill: '#fff', effects: [] } }] }] };
  const prevGrid = { id: 'stale', style: { fill: '#abc', effects: [] } };
  assert.equal(resolveActiveGrid(layer, 0, prevGrid), 'g4');
});

test('resolveActiveGrid: returns null for an empty frame, a missing layer, or no prior selection', () => {
  const layer = { frames: [{ grids: [] }] };
  assert.equal(resolveActiveGrid(layer, 0, null), null);
  assert.equal(resolveActiveGrid(undefined, 0, null), null);
});

test('resolveActiveGrid: with no prior selection but a non-empty frame, defaults to the first shape', () => {
  const layer = { frames: [{ grids: [{ id: 'g1', style: { fill: '#f00', effects: [] } }, { id: 'g2', style: { fill: '#0f0', effects: [] } }] }] };
  assert.equal(resolveActiveGrid(layer, 0, null), 'g1');
});

test('refreshActiveGrid keeps the active shape selected when re-derived for the same (already-active) layer', () => {
  const canvas = createCanvas({ width: 3, height: 3 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas);
  paintCell(canvas, 0, 0, '#ff0000'); // shape A, active
  addGrid(canvas, layer.id, {}); // shape B, active — a separate shape in the same layer
  const shapeBId = canvas.activeGridId;

  refreshActiveGrid(canvas, layer.id); // simulate re-clicking the already-active layer row
  assert.equal(canvas.activeGridId, shapeBId, 're-deriving for the same layer must not override the active shape');
});

test('refreshActiveGrid still resets to the first shape when the layer actually changes', () => {
  const canvas = createCanvas({ width: 3, height: 3 });
  canvas.tier = 'advanced';
  const layerA = addLayer(canvas, { name: 'A' });
  paintCell(canvas, 0, 0, '#ff0000');
  addGrid(canvas, layerA.id, {}); // second shape in A, active
  const layerB = addLayer(canvas, { name: 'B' }); // becomes active

  canvas.activeLayerId = layerA.id; // switch back to A directly (bypassing the store)
  refreshActiveGrid(canvas, layerB.id); // prevLayerId (B) differs from the new activeLayerId (A) -> real change
  assert.equal(canvas.activeGridId, layerA.frames[0].grids[0].id, 'falls through to the first shape, no carryover across a real layer switch');
});

test('setActiveFrame keeps the same shape selected across a scrub when its id survives (duplicateFrame case)', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  addLayer(canvas);
  paintCell(canvas, 0, 0, '#ff0000');
  const originalGridId = canvas.activeGridId;

  duplicateFrame(canvas, 0); // now on frame 1, a literal copy including grid ids
  assert.equal(canvas.activeGridId, originalGridId);
  setActiveFrame(canvas, 0);
  assert.equal(canvas.activeGridId, originalGridId);
  setActiveFrame(canvas, 1);
  assert.equal(canvas.activeGridId, originalGridId);
});

test('setActiveFrame prefers a style match over "first shape" when scrubbing to an independently-drawn frame', () => {
  const canvas = createCanvas({ width: 3, height: 3 });
  canvas.tier = 'advanced';
  addLayer(canvas);
  paintCell(canvas, 0, 0, '#ff0000'); // frame 0's only shape, red — becomes activeGridId

  addFrame(canvas); // frame 1, blank, active
  paintCell(canvas, 1, 1, '#0000ff'); // shape A: blue, created+selected first
  canvas.activeGridId = null; // deselect so the next paint creates a separate shape instead of growing blue
  paintCell(canvas, 2, 2, '#ff0000'); // shape B: red, a *different* shape instance than frame 0's, added after blue
  const redShapeId = canvas.layers[0].frames[1].grids.find((g) => g.style.fill === '#ff0000').id;

  setActiveFrame(canvas, 0); // back to frame 0, whose only (red) shape is activeGridId
  setActiveFrame(canvas, 1); // scrub to frame 1: no id match (different shape instance) — style match should pick the red one, not grids[0] (blue)
  assert.equal(canvas.activeGridId, redShapeId);
});
