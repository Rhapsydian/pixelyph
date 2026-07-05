import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downsampleImage, generatePalette, importRasterToGrid } from '../../src/model/importRaster.js';

// A 4x4 source split into four solid 2x2 color blocks: red / green / blue / yellow.
function fourColorBlockImage() {
  const width = 4;
  const height = 4;
  const data = new Uint8Array(width * height * 4);
  function setPx(x, y, r, g, b, a = 255) {
    const i = (y * width + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) setPx(x, y, 255, 0, 0);
  for (let y = 0; y < 2; y++) for (let x = 2; x < 4; x++) setPx(x, y, 0, 255, 0);
  for (let y = 2; y < 4; y++) for (let x = 0; x < 2; x++) setPx(x, y, 0, 0, 255);
  for (let y = 2; y < 4; y++) for (let x = 2; x < 4; x++) setPx(x, y, 255, 255, 0);
  return { width, height, data };
}

test('downsampleImage nearest-neighbor picks one representative pixel per target cell', () => {
  const down = downsampleImage(fourColorBlockImage(), 2, 2, 'nearest');
  assert.deepEqual(Array.from(down.data), [
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 0, 255,
  ]);
});

test('downsampleImage average blends a source block into one target pixel', () => {
  // a 2x2 block of red and a 2x2 block of green side by side, downsampled to 1x2
  const data = new Uint8Array(4 * 2 * 4);
  const width = 4;
  function setPx(x, y, r, g, b) {
    const i = (y * width + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  setPx(0, 0, 255, 0, 0);
  setPx(1, 0, 0, 0, 0);
  setPx(0, 1, 0, 0, 0);
  setPx(1, 1, 255, 0, 0);
  const down = downsampleImage({ width, height: 2, data }, 2, 1, 'average');
  assert.equal(down.data[0], 128); // (255+0)/2 = 127.5, Math.round rounds half-up to 128
  assert.equal(down.data[1], 0);
});

test('generatePalette returns a single color fast-path when the image is one solid color', () => {
  const solid = downsampleImage(fourColorBlockImage(), 1, 1, 'nearest');
  const palette = generatePalette(solid);
  assert.equal(palette.length, 1);
});

test('generatePalette returns no colors for a fully transparent image', () => {
  const image = { width: 1, height: 1, data: new Uint8Array([255, 0, 0, 0]) };
  assert.deepEqual(generatePalette(image), []);
});

test('importRasterToGrid with an existing palette nearest-matches each block to its exact color', () => {
  const result = importRasterToGrid(fourColorBlockImage(), 2, 2, { mode: 'nearest', palette: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] });
  assert.deepEqual(result.palette, ['#ff0000', '#00ff00', '#0000ff', '#ffff00']);
  assert.deepEqual(result.colors, ['#ff0000', '#00ff00', '#0000ff', '#ffff00']);
});

test('importRasterToGrid without a palette generates one via median-cut, one distinct color per block', () => {
  const result = importRasterToGrid(fourColorBlockImage(), 2, 2, { mode: 'nearest' });
  assert.equal(result.palette.length, 4);
  assert.equal(new Set(result.colors).size, 4); // four distinct generated colors, one per source block
  assert.equal(result.colors.length, 4);
  assert.ok(result.colors.every(Boolean)); // every cell was opaque, so every cell got a color
});

test('importRasterToGrid treats sufficiently-transparent pixels as unpainted (null)', () => {
  const image = { width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 10]) };
  const result = importRasterToGrid(image, 2, 1, { mode: 'nearest', palette: ['#ff0000'] });
  assert.equal(result.colors[0], '#ff0000');
  assert.equal(result.colors[1], null);
});
