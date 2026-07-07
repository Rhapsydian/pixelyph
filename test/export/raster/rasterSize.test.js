import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sizeFromScale, resizeLockedDimension, MAX_RASTER_DIMENSION } from '../../../src/export/raster/rasterSize.js';

test('sizeFromScale applies a uniform integer multiplier', () => {
  assert.deepEqual(sizeFromScale(16, 16, 4), { width: 64, height: 64 });
});

test('sizeFromScale handles a non-square canvas', () => {
  assert.deepEqual(sizeFromScale(16, 9, 8), { width: 128, height: 72 });
});

test('sizeFromScale rounds a non-integer scale to whole pixels', () => {
  assert.deepEqual(sizeFromScale(15, 9, 2.5), { width: 38, height: 23 }); // 37.5 -> 38, 22.5 -> 23 (round-half-up)
});

test('sizeFromScale clamps to MAX_RASTER_DIMENSION per side', () => {
  assert.deepEqual(sizeFromScale(16, 16, 1000), { width: MAX_RASTER_DIMENSION, height: MAX_RASTER_DIMENSION });
});

test('resizeLockedDimension recomputes height from a new width, preserving aspect ratio', () => {
  assert.deepEqual(resizeLockedDimension(16, 16, 'width', 100), { width: 100, height: 100 });
  assert.deepEqual(resizeLockedDimension(16, 9, 'width', 160), { width: 160, height: 90 });
});

test('resizeLockedDimension recomputes width from a new height, preserving aspect ratio', () => {
  assert.deepEqual(resizeLockedDimension(16, 9, 'height', 90), { width: 160, height: 90 });
});

test('resizeLockedDimension rounds a non-evenly-divisible aspect ratio consistently', () => {
  // 15x9 canvas, aspect ratio 5/3 — width=101 -> height=101/(5/3)=60.6 -> 61
  assert.deepEqual(resizeLockedDimension(15, 9, 'width', 101), { width: 101, height: 61 });
});

test('resizeLockedDimension floors newValue itself to a whole pixel and never below 1', () => {
  assert.deepEqual(resizeLockedDimension(16, 16, 'width', 0), { width: 1, height: 1 });
  assert.deepEqual(resizeLockedDimension(16, 16, 'width', -5), { width: 1, height: 1 });
});

test('resizeLockedDimension clamps both dimensions to MAX_RASTER_DIMENSION', () => {
  const result = resizeLockedDimension(16, 16, 'width', 100000);
  assert.equal(result.width, MAX_RASTER_DIMENSION);
  assert.equal(result.height, MAX_RASTER_DIMENSION);
});
