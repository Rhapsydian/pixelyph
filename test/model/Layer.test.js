import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayer, growToInclude, isEmpty } from '../../src/model/Layer.js';

function set(layer, x, y, value = 1) {
  layer.frames[0].pixels[y * layer.width + x] = value;
}
function get(layer, x, y) {
  return layer.frames[0].pixels[y * layer.width + x];
}

test('growToInclude is a no-op when the point is already inside bounds', () => {
  const layer = createLayer({ width: 4, height: 4 });
  set(layer, 1, 1);
  growToInclude(layer, 2, 2);
  assert.equal(layer.width, 4);
  assert.equal(layer.height, 4);
  assert.deepEqual(layer.offset, { x: 0, y: 0 });
  assert.equal(get(layer, 1, 1), 1);
});

test('growToInclude grows towards positive x/y, preserving content and offset', () => {
  const layer = createLayer({ width: 2, height: 2 });
  set(layer, 0, 0);
  growToInclude(layer, 5, 4);
  assert.equal(layer.width, 6);
  assert.equal(layer.height, 5);
  assert.deepEqual(layer.offset, { x: 0, y: 0 });
  assert.equal(get(layer, 0, 0), 1);
});

test('growToInclude grows towards negative x/y, shifting offset and preserving content at its new local position', () => {
  const layer = createLayer({ width: 2, height: 2, offset: { x: 3, y: 3 } });
  set(layer, 0, 0); // canvas-space (3, 3)
  growToInclude(layer, 1, 1); // canvas-space point below/left of current bounds
  assert.deepEqual(layer.offset, { x: 1, y: 1 });
  assert.equal(layer.width, 4);
  assert.equal(layer.height, 4);
  // the original cell (canvas-space 3,3) now lives at local (2,2) relative to the new offset
  assert.equal(get(layer, 2, 2), 1);
  assert.equal(get(layer, 0, 0), 0);
});

test('growToInclude growing in only one negative direction leaves the other axis untouched', () => {
  const layer = createLayer({ width: 3, height: 3, offset: { x: 2, y: 2 } });
  set(layer, 1, 1); // canvas-space (3, 3)
  growToInclude(layer, -1, 3); // grow left only; y already in bounds
  assert.deepEqual(layer.offset, { x: -1, y: 2 });
  assert.equal(layer.width, 6);
  assert.equal(layer.height, 3);
  assert.equal(get(layer, 4, 1), 1); // shifted right by (2 - -1) = 3
});

test('growToInclude reallocates every frame, not just the first', () => {
  const layer = createLayer({ width: 2, height: 2 });
  layer.frames.push({ pixels: new Uint8Array(4) });
  layer.frames[1].pixels[0] = 1;
  growToInclude(layer, 3, 3);
  assert.equal(layer.frames[1].pixels.length, layer.width * layer.height);
  assert.equal(layer.frames[1].pixels[0], 1);
});

test('isEmpty is unaffected by growToInclude when no cell was ever set', () => {
  const layer = createLayer({ width: 2, height: 2 });
  growToInclude(layer, 4, 4);
  assert.ok(isEmpty(layer));
});
