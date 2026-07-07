import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameFileName } from '../../../src/export/raster/spriteArchive.js';

test('frameFileName zero-pads to a stable width across the whole frame count', () => {
  assert.equal(frameFileName(0, 12), 'frame-00.png');
  assert.equal(frameFileName(9, 12), 'frame-09.png');
  assert.equal(frameFileName(11, 12), 'frame-11.png');
});

test('frameFileName needs no padding for single-digit frame counts', () => {
  assert.equal(frameFileName(0, 5), 'frame-0.png');
  assert.equal(frameFileName(4, 5), 'frame-4.png');
});

test('frameFileName pads wider for triple-digit frame counts', () => {
  assert.equal(frameFileName(5, 150), 'frame-005.png');
  assert.equal(frameFileName(149, 150), 'frame-149.png');
});

test('frameFileName handles a single frame', () => {
  assert.equal(frameFileName(0, 1), 'frame-0.png');
});

test('frameFileName accepts a custom base name', () => {
  assert.equal(frameFileName(0, 12, 'sprite'), 'sprite-00.png');
});
