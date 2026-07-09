import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, colorDistance } from '../../src/model/colorDistance.js';

test('hexToRgb parses a hex string to an RGB triple', () => {
  assert.deepEqual(hexToRgb('#ff0080'), [255, 0, 128]);
});

test('colorDistance is 0 for identical colors', () => {
  assert.equal(colorDistance('#123456', '#123456'), 0);
});

test('colorDistance is the squared Euclidean RGB distance', () => {
  // black -> white: (255-0)^2 * 3 = 195075
  assert.equal(colorDistance('#000000', '#ffffff'), 195075);
});

test('colorDistance is symmetric', () => {
  assert.equal(colorDistance('#ff0000', '#00ff00'), colorDistance('#00ff00', '#ff0000'));
});
