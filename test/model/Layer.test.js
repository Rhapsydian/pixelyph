import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayer } from '../../src/model/Layer.js';

// Session 4: these all exercised growToInclude/isEmpty, which moved to
// Grid.js as growGridToInclude/shrinkGridToFit, scoped to one Grid instead
// of a whole Layer's frames array (see BACKLOG.md's Layer/Frame/Grid
// redesign entry). Equivalent coverage now lives in Grid.test.js.

test.skip('growToInclude is a no-op when the point is already inside bounds', () => {});
test.skip('growToInclude grows towards positive x/y, preserving content and offset', () => {});
test.skip('growToInclude grows towards negative x/y, shifting offset and preserving content at its new local position', () => {});
test.skip('growToInclude growing in only one negative direction leaves the other axis untouched', () => {});
test.skip('growToInclude reallocates every frame, not just the first', () => {});
test.skip('isEmpty is unaffected by growToInclude when no cell was ever set', () => {});

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
