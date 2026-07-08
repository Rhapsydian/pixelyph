import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCanvas,
  paintCell,
  resizeCanvas,
  colorAt,
  addLayer,
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
} from '../../src/model/Canvas.js';

test('colorAt reads the topmost (last) visible layer that owns a cell', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 1, '#00ff00');
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(colorAt(canvas, 1, 1), '#00ff00');
  assert.equal(colorAt(canvas, 1, 0), null);
});

// Session 4: asserts the pre-migration full-canvas Layer shape (layer.width/
// height/offset) — see BACKLOG.md's Layer/Frame/Grid redesign entry.
test.skip('resizeCanvas grows a full-canvas layer with the new dimensions, content preserved relative to anchor', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 1, '#ff0000');
  resizeCanvas(canvas, 4, 4, 'top-left');
  assert.equal(canvas.width, 4);
  assert.equal(canvas.height, 4);
  const layer = canvas.layers[0];
  assert.equal(layer.width, 4);
  assert.equal(layer.height, 4);
  assert.deepEqual(layer.offset, { x: 0, y: 0 });
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(colorAt(canvas, 1, 1), '#ff0000');
  assert.equal(colorAt(canvas, 3, 3), null);
});

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

// --- Advanced tier ---

// Session 4: addLayer no longer creates a full-canvas grid eagerly (see BACKLOG.md).
test.skip('addLayer appends a full-canvas layer and makes it active', () => {
  const canvas = createCanvas({ width: 3, height: 3 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'Sky', fill: '#0000ff' });
  assert.equal(canvas.layers.length, 1);
  assert.equal(canvas.activeLayerId, layer.id);
  assert.equal(layer.width, 3);
  assert.equal(layer.height, 3);
  assert.equal(layer.style.fill, '#0000ff');
});

// Session 4: asserts layer.frames[i].pixels dense buffer (see BACKLOG.md).
test.skip('advanced-tier paintCell paints/erases into the active layer only, growing it as needed', () => {
  const canvas = createCanvas({ width: 4, height: 4 });
  canvas.tier = 'advanced';
  const a = addLayer(canvas, { name: 'A' });
  addLayer(canvas, { name: 'B' }); // becomes active
  canvas.activeLayerId = a.id;
  paintCell(canvas, 0, 0, '#ff0000');
  assert.equal(a.frames[0].pixels[0], 1);
  paintCell(canvas, 0, 0, null);
  assert.equal(a.frames[0].pixels[0], 0);
});

test('advanced-tier paintCell is a no-op with no active layer', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  paintCell(canvas, 0, 0, '#ff0000'); // no layers exist yet
  assert.equal(canvas.layers.length, 0);
});

// Session 4: asserts layer.frames[i].pixels dense buffer (see BACKLOG.md).
test.skip('advanced-tier paintCell is a no-op on a locked layer', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas);
  layer.locked = true;
  paintCell(canvas, 0, 0, '#ff0000');
  assert.ok(layer.frames[0].pixels.every((v) => v === 0));
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

// Session 4: asserts the retired autoManaged flag (Simple tier is now a
// single Layer, not per-color auto-layers — see BACKLOG.md).
test.skip('convertTier simple -> advanced flips autoManaged off and preserves layer content/position', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  const layerId = canvas.layers[0].id;
  convertTier(canvas, 'advanced');
  assert.equal(canvas.tier, 'advanced');
  assert.equal(canvas.layers[0].id, layerId);
  assert.equal(canvas.layers[0].autoManaged, false);
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(canvas.activeLayerId, layerId);
});

// Session 4: asserts layer.style (style now lives on Grid, not Layer — see BACKLOG.md).
test.skip('convertTier simple -> advanced on a blank canvas creates one empty layer with a solid black fill', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  assert.equal(canvas.layers.length, 0);
  convertTier(canvas, 'advanced');
  assert.equal(canvas.tier, 'advanced');
  assert.equal(canvas.layers.length, 1);
  assert.equal(canvas.layers[0].style.fill, '#000000');
  assert.equal(canvas.activeLayerId, canvas.layers[0].id);
  assert.equal(colorAt(canvas, 0, 0), null); // layer exists but is unpainted
});

// Session 4: asserts direct layer.style mutation on the pre-migration shape (see BACKLOG.md).
test.skip('convertTier advanced -> simple rebuilds one auto-managed layer per composited color, dropping non-solid fills', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  const solid = addLayer(canvas, { name: 'solid', fill: '#ff0000' });
  paintCell(canvas, 0, 0, 'x'); // color arg irrelevant in advanced tier
  const gradientLayer = addLayer(canvas, { name: 'gradient' });
  gradientLayer.style.fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  paintCell(canvas, 1, 0, 'x');
  convertTier(canvas, 'simple');
  assert.equal(canvas.tier, 'simple');
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(colorAt(canvas, 1, 0), null); // gradient cell has no simple-tier equivalent
  assert.equal(canvas.activeLayerId, null);
  void solid;
});

test('convertTier is a no-op when already at the requested tier', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  const before = canvas.layers;
  convertTier(canvas, 'simple');
  assert.equal(canvas.layers, before);
});

// --- duplicateLayer / mergeLayerDown / eraseFromLayer ---

// Session 4: asserts layer.style/layer.frames[i].pixels (style/pixels now live on Grid — see BACKLOG.md).
test.skip('duplicateLayer copies content/style independently and inserts directly above the original, active', () => {
  const canvas = createCanvas({ width: 3, height: 3 });
  canvas.tier = 'advanced';
  const original = addLayer(canvas, { name: 'Base', fill: '#ff0000' });
  paintCell(canvas, 0, 0, 'x');
  original.style.stroke = { color: '#000000', width: 0.1 };

  const copy = duplicateLayer(canvas, original.id);
  assert.equal(canvas.layers[1], copy);
  assert.equal(canvas.activeLayerId, copy.id);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.name, 'Base copy');
  assert.equal(copy.style.fill, '#ff0000');
  assert.deepEqual(copy.style.stroke, original.style.stroke);
  assert.notEqual(copy.style.stroke, original.style.stroke); // independent object

  // mutating the copy's pixels/style must not affect the original
  copy.frames[0].pixels[0] = 0;
  copy.frames[0].pixels[1] = 1;
  copy.style.stroke.width = 0.9;
  assert.equal(original.frames[0].pixels[0], 1);
  assert.equal(original.frames[0].pixels[1], 0);
  assert.equal(original.style.stroke.width, 0.1);
});

test('duplicateLayer returns null for an unknown layer id', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  assert.equal(duplicateLayer(canvas, 'nope'), null);
});

// Session 4: asserts layer.style.fill (style now lives on Grid — see BACKLOG.md).
test.skip('duplicateLayer copies a gradient fill independently', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const original = addLayer(canvas, { name: 'Gradient' });
  original.style.fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };

  const copy = duplicateLayer(canvas, original.id);
  assert.deepEqual(copy.style.fill, original.style.fill);
  assert.notEqual(copy.style.fill, original.style.fill);

  copy.style.fill.stops[0].color = '#123456';
  assert.equal(original.style.fill.stops[0].color, '#fff');
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

// Session 4: constructs layers via the pre-migration offset/width/height/frames[i].pixels shape (see BACKLOG.md).
test.skip('mergeLayerDown combines pixel data across different offsets/sizes and keeps the bottom layer\'s id/name/style', () => {
  const canvas = createCanvas({ width: 6, height: 6 });
  canvas.tier = 'advanced';
  const bottom = addLayer(canvas, { name: 'Bottom', fill: '#0000ff' });
  bottom.style.stroke = { color: '#000', width: 0.2 };
  canvas.activeLayerId = bottom.id;
  paintCell(canvas, 0, 0, 'x'); // bottom's own cell at (0,0)

  const top = addLayer(canvas, { name: 'Top', fill: '#ff0000' });
  top.offset = { x: 4, y: 4 };
  top.width = 1;
  top.height = 1;
  top.frames = [{ pixels: new Uint8Array([1]) }]; // top's own cell at canvas-space (4,4)

  mergeLayerDown(canvas, top.id);

  assert.equal(canvas.layers.length, 1);
  const merged = canvas.layers[0];
  assert.equal(merged.id, bottom.id);
  assert.equal(merged.name, 'Bottom');
  assert.equal(merged.style.fill, '#0000ff');
  assert.deepEqual(merged.style.stroke, { color: '#000', width: 0.2 });
  assert.equal(canvas.activeLayerId, bottom.id);
  // bounding box now spans both original layers' extents
  assert.equal(colorAt(canvas, 0, 0), '#0000ff');
  assert.equal(colorAt(canvas, 4, 4), '#0000ff'); // merged cell, styled as the surviving (bottom) layer
});

test('mergeLayerDown no-ops when the layer is already at the bottom of the stack', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const only = addLayer(canvas, { name: 'Only' });
  mergeLayerDown(canvas, only.id);
  assert.equal(canvas.layers.length, 1);
  assert.equal(canvas.layers[0], only);
});

// Session 4: asserts layer.frames[i].pixels dense buffer (see BACKLOG.md).
test.skip('eraseFromLayer clears a cell from a specific layer regardless of activeLayerId, and no-ops on a locked layer', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'A' });
  paintCell(canvas, 0, 0, 'x');
  addLayer(canvas, { name: 'B' }); // becomes active; `layer` is no longer canvas.activeLayerId
  eraseFromLayer(canvas, layer, 0, 0);
  assert.equal(layer.frames[0].pixels[0], 0);

  layer.frames[0].pixels[0] = 1;
  layer.locked = true;
  eraseFromLayer(canvas, layer, 0, 0);
  assert.equal(layer.frames[0].pixels[0], 1); // untouched — locked
});

// --- Animation (Phase 7): frame add/remove/duplicate ---

// Session 4: asserts layer.frames[i].pixels dense buffer (see BACKLOG.md).
test.skip('addFrame inserts a blank frame into every layer, keeping frameCount uniform, and makes it active', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const a = addLayer(canvas, { name: 'A' });
  const b = addLayer(canvas, { name: 'B' });
  paintCell(canvas, 0, 0, 'x'); // paints frame 0 of the active layer (b)

  addFrame(canvas);

  assert.equal(canvas.frameCount, 2);
  assert.equal(canvas.activeFrame, 1);
  assert.equal(a.frames.length, 2);
  assert.equal(b.frames.length, 2);
  // the invariant: every layer gets the new blank frame, regardless of which layer was active
  assert.ok(a.frames[1].pixels.every((v) => v === 0));
  assert.ok(b.frames[1].pixels.every((v) => v === 0));
  // frame 0's prior content is untouched
  assert.equal(b.frames[0].pixels[0], 1);
});

// Session 4: asserts layer.frames[i].pixels dense buffer (see BACKLOG.md).
test.skip('addFrame inserts at a given index, shifting later frames back', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, {});
  paintCell(canvas, 0, 0, 'x'); // frame 0
  addFrame(canvas); // frame 1, now active
  paintCell(canvas, 1, 1, 'x'); // frame 1

  addFrame(canvas, 1); // insert a blank frame between 0 and (old) 1

  assert.equal(layer.frames.length, 3);
  assert.equal(layer.frames[0].pixels[0], 1); // original frame 0 untouched
  assert.ok(layer.frames[1].pixels.every((v) => v === 0)); // new blank frame
  assert.equal(layer.frames[2].pixels[3], 1); // old frame 1 shifted to index 2
  assert.equal(canvas.activeFrame, 1);
});

// Session 4: asserts layer.frames[i].pixels dense buffer (see BACKLOG.md).
test.skip('duplicateFrame copies every layer\'s frame at index, inserting the copy right after it', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, {});
  paintCell(canvas, 0, 0, 'x');

  duplicateFrame(canvas, 0);

  assert.equal(canvas.frameCount, 2);
  assert.equal(canvas.activeFrame, 1);
  assert.equal(layer.frames[1].pixels[0], 1);
  // independent buffers — mutating the copy doesn't affect the original
  layer.frames[1].pixels[0] = 0;
  assert.equal(layer.frames[0].pixels[0], 1);
});

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

// Session 4: asserts layer.frames[i].pixels dense buffer (see BACKLOG.md).
test.skip('paintCell no-ops on a layer hidden in the active frame (same "can\'t be edited" contract as locked), and paints normally once shown again', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, {});
  setLayerFrameVisibility(canvas, layer.id, 0, false);

  paintCell(canvas, 0, 0, 'x');
  assert.ok(layer.frames[0].pixels.every((v) => v === 0), 'hidden-in-this-frame blocks painting, like a locked layer');

  setLayerFrameVisibility(canvas, layer.id, 0, true);
  paintCell(canvas, 0, 0, 'x');
  assert.equal(layer.frames[0].pixels[0], 1);
});

// Session 4: asserts layer.frames[i].pixels dense buffer (see BACKLOG.md).
test.skip('removeFrame removes the frame from every layer and clamps activeFrame', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, {});
  addFrame(canvas); // frame 1
  addFrame(canvas); // frame 2, active
  paintCell(canvas, 0, 0, 'x'); // frame 2

  removeFrame(canvas, 1);

  assert.equal(canvas.frameCount, 2);
  assert.equal(layer.frames.length, 2);
  assert.equal(layer.frames[1].pixels[0], 1); // old frame 2 shifted to index 1
  assert.equal(canvas.activeFrame, 1); // clamped from the stale index 2
});

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

// Session 4: asserts layer.frames[i].pixels dense buffer (see BACKLOG.md).
test.skip('paintCell targets only the active frame, leaving other frames of the same layer untouched', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, {});
  paintCell(canvas, 0, 0, 'x'); // frame 0
  addFrame(canvas); // frame 1, active
  paintCell(canvas, 1, 1, 'x'); // frame 1

  assert.equal(layer.frames[0].pixels[0], 1);
  assert.equal(layer.frames[0].pixels[3], 0);
  assert.equal(layer.frames[1].pixels[0], 0);
  assert.equal(layer.frames[1].pixels[3], 1);
});

// Session 4: asserts layer.style.fill directly (style now lives on Grid — see BACKLOG.md).
test.skip('colorAt/topVisibleLayerAt read from the active frame, not always frame 0', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'A' });
  addFrame(canvas); // frame 1, active
  paintCell(canvas, 0, 0, 'x'); // color arg is ignored for advanced-tier paint (see Canvas.paintCell); layer.style.fill drives colorAt

  assert.equal(colorAt(canvas, 0, 0), layer.style.fill);
  assert.equal(topVisibleLayerAt(canvas, 0, 0), layer);

  setActiveFrame(canvas, 0);
  assert.equal(colorAt(canvas, 0, 0), null);
  assert.equal(topVisibleLayerAt(canvas, 0, 0), null);
});

// Session 4: mutates layer.frames[i].pixels directly (see BACKLOG.md).
test.skip('mergeLayerDown merges frame-by-frame, keeping bottom\'s frameCount', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const bottom = addLayer(canvas, { name: 'bottom' });
  addFrame(canvas); // frame 1
  const top = addLayer(canvas, { name: 'top' }); // active, 2 frames (matches canvas.frameCount)

  bottom.frames[0].pixels[0] = 1;
  bottom.frames[1].pixels[1] = 1;
  top.frames[0].pixels[2] = 1;
  top.frames[1].pixels[3] = 1;

  mergeLayerDown(canvas, top.id);

  assert.equal(canvas.layers.length, 1);
  const merged = canvas.layers[0];
  assert.equal(merged.frames.length, 2);
  assert.equal(merged.frames[0].pixels[0], 1);
  assert.equal(merged.frames[0].pixels[2], 1);
  assert.equal(merged.frames[1].pixels[1], 1);
  assert.equal(merged.frames[1].pixels[3], 1);
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

test('convertTier advanced -> simple rebuilds a single style-scanned layer from the composited active frame, dropping non-solid fills', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'solid' });
  paintCell(canvas, 0, 0, '#ff0000');
  const gradientLayer = addLayer(canvas, { name: 'gradient' });
  paintCell(canvas, 1, 0, '#00ff00');
  gradientLayer.frames[0].grids[0].style.fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };

  convertTier(canvas, 'simple');

  assert.equal(canvas.tier, 'simple');
  assert.equal(canvas.layers.length, 1);
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(colorAt(canvas, 1, 0), null); // gradient cell has no simple-tier equivalent
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
