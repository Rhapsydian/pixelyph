import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSpriteSheetLayout, mergeFrameDurations } from '../../../src/export/raster/spriteSheet.js';

test('computeSpriteSheetLayout tiles frames left-to-right in a single row', () => {
  const layout = computeSpriteSheetLayout(3, 16, 16);
  assert.equal(layout.sheetWidth, 48);
  assert.equal(layout.sheetHeight, 16);
  assert.deepEqual(layout.frames, [
    { x: 0, y: 0, w: 16, h: 16 },
    { x: 16, y: 0, w: 16, h: 16 },
    { x: 32, y: 0, w: 16, h: 16 },
  ]);
});

test('computeSpriteSheetLayout accounts for a non-square, scaled frame size', () => {
  const layout = computeSpriteSheetLayout(2, 20, 40); // e.g. a 5x10 canvas at 4x scale
  assert.equal(layout.sheetWidth, 40);
  assert.equal(layout.sheetHeight, 40);
  assert.deepEqual(layout.frames, [
    { x: 0, y: 0, w: 20, h: 40 },
    { x: 20, y: 0, w: 20, h: 40 },
  ]);
});

test('computeSpriteSheetLayout handles a single frame', () => {
  const layout = computeSpriteSheetLayout(1, 16, 16);
  assert.equal(layout.sheetWidth, 16);
  assert.deepEqual(layout.frames, [{ x: 0, y: 0, w: 16, h: 16 }]);
});

test('computeSpriteSheetLayout handles zero frames (empty sheet)', () => {
  const layout = computeSpriteSheetLayout(0, 16, 16);
  assert.equal(layout.sheetWidth, 0);
  assert.deepEqual(layout.frames, []);
});

test('mergeFrameDurations attaches each frame\'s own duration by index, matching Aseprite-style per-frame timing', () => {
  const layout = computeSpriteSheetLayout(3, 16, 16);
  const merged = mergeFrameDurations(layout.frames, [100, 250, 80]);
  assert.deepEqual(merged, [
    { x: 0, y: 0, w: 16, h: 16, duration: 100 },
    { x: 16, y: 0, w: 16, h: 16, duration: 250 },
    { x: 32, y: 0, w: 16, h: 16, duration: 80 },
  ]);
  // pure — the input layout array is untouched
  assert.deepEqual(layout.frames[0], { x: 0, y: 0, w: 16, h: 16 });
});
