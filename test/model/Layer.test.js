import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayer } from '../../src/model/Layer.js';

// growToInclude/isEmpty moved to Grid.js as growGridToInclude/
// shrinkGridToFit, scoped to one Grid instead of a whole Layer's frames
// array (see docs/data-model.md section 3) — coverage lives in
// Grid.test.js, including the growing-in-one-direction-only and
// still-empty-after-growth edge cases the old Layer-level tests wanted.
// "reallocates every frame" has no replacement here: growGridToInclude
// only ever takes one Grid, so there's no frames array to reallocate —
// the sparsity property it was guarding (painting frame 3 doesn't touch
// frame 0's grids) is covered at the Canvas.js level instead.

test('createLayer is pure identity — no style, offset, or size, just frames of empty {visible,grids} slots', () => {
  const layer = createLayer({ name: 'Ink', frameCount: 3 });
  assert.equal(layer.name, 'Ink');
  assert.equal(layer.locked, false);
  assert.equal(layer.opacity, 1);
  assert.equal(layer.frames.length, 3);
  for (const frame of layer.frames) {
    assert.equal(frame.visible, true);
    assert.deepEqual(frame.grids, []);
  }
  assert.equal(layer.style, undefined);
  assert.equal(layer.offset, undefined);
  assert.equal(layer.width, undefined);
});

test('createLayer defaults to name "Layer" and a single frame', () => {
  const layer = createLayer();
  assert.equal(layer.name, 'Layer');
  assert.equal(layer.frames.length, 1);
});

test('createLayer mints a fresh id each call', () => {
  const a = createLayer();
  const b = createLayer();
  assert.notEqual(a.id, b.id);
});
