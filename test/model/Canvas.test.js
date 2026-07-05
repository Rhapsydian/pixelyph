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
} from '../../src/model/Canvas.js';

test('colorAt reads the topmost (last) visible layer that owns a cell', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 1, '#00ff00');
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(colorAt(canvas, 1, 1), '#00ff00');
  assert.equal(colorAt(canvas, 1, 0), null);
});

test('resizeCanvas grows a full-canvas layer with the new dimensions, content preserved relative to anchor', () => {
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

test('addLayer appends a full-canvas layer and makes it active', () => {
  const canvas = createCanvas({ width: 3, height: 3 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'Sky', fill: '#0000ff' });
  assert.equal(canvas.layers.length, 1);
  assert.equal(canvas.activeLayerId, layer.id);
  assert.equal(layer.width, 3);
  assert.equal(layer.height, 3);
  assert.equal(layer.style.fill, '#0000ff');
});

test('advanced-tier paintCell paints/erases into the active layer only, growing it as needed', () => {
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

test('advanced-tier paintCell is a no-op on a locked layer', () => {
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
  b.visible = false;
  assert.equal(topVisibleLayerAt(canvas, 0, 0), a);
  assert.equal(topVisibleLayerAt(canvas, 1, 1), null);
});

test('convertTier simple -> advanced flips autoManaged off and preserves layer content/position', () => {
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

test('convertTier advanced -> simple rebuilds one auto-managed layer per composited color, dropping non-solid fills', () => {
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

test('duplicateLayer copies content/style independently and inserts directly above the original, active', () => {
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

test('mergeLayerDown combines pixel data across different offsets/sizes and keeps the bottom layer\'s id/name/style', () => {
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

test('eraseFromLayer clears a cell from a specific layer regardless of activeLayerId, and no-ops on a locked layer', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'A' });
  paintCell(canvas, 0, 0, 'x');
  addLayer(canvas, { name: 'B' }); // becomes active; `layer` is no longer canvas.activeLayerId
  eraseFromLayer(layer, 0, 0);
  assert.equal(layer.frames[0].pixels[0], 0);

  layer.frames[0].pixels[0] = 1;
  layer.locked = true;
  eraseFromLayer(layer, 0, 0);
  assert.equal(layer.frames[0].pixels[0], 1); // untouched — locked
});
