import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFontMeta,
  createGlyphSet,
  createGlyph,
  getGlyph,
  setGlyph,
  removeGlyph,
  wouldCollide,
  nextIconCodepoint,
  resizeGlyphSet,
  glyphToCanvas,
  canvasToGlyphPixels,
} from '../../src/model/GlyphSet.js';

test('createGlyphSet defaults to character kind with default FontMeta', () => {
  const glyphSet = createGlyphSet({});
  assert.equal(glyphSet.kind, 'characters');
  assert.equal(glyphSet.meta.pixelsPerEm, 16);
  assert.equal(glyphSet.glyphs.size, 0);
});

test('createFontMeta overrides merge over the defaults', () => {
  const meta = createFontMeta({ familyName: 'Chunky', pixelsPerEm: 24 });
  assert.equal(meta.familyName, 'Chunky');
  assert.equal(meta.pixelsPerEm, 24);
  assert.equal(meta.styleName, 'Regular'); // untouched default
});

test('glyph CRUD: set/get/remove round-trip', () => {
  const glyphSet = createGlyphSet({ kind: 'characters' });
  const glyph = createGlyph({ width: 5, height: 16, name: 'A' });
  setGlyph(glyphSet, 65, glyph);
  assert.equal(getGlyph(glyphSet, 65), glyph);
  assert.equal(getGlyph(glyphSet, 66), null);
  removeGlyph(glyphSet, 65);
  assert.equal(getGlyph(glyphSet, 65), null);
});

test('wouldCollide is true only for an already-assigned codepoint', () => {
  const glyphSet = createGlyphSet({});
  assert.equal(wouldCollide(glyphSet, 65), false);
  setGlyph(glyphSet, 65, createGlyph({ width: 5, height: 16 }));
  assert.equal(wouldCollide(glyphSet, 65), true);
  assert.equal(wouldCollide(glyphSet, 66), false);
});

test('nextIconCodepoint starts at U+E000 on an empty set', () => {
  const glyphSet = createGlyphSet({ kind: 'icons' });
  assert.equal(nextIconCodepoint(glyphSet), 0xe000);
});

test('nextIconCodepoint skips already-used values', () => {
  const glyphSet = createGlyphSet({ kind: 'icons' });
  setGlyph(glyphSet, 0xe000, createGlyph({ width: 16, height: 16, name: 'star' }));
  setGlyph(glyphSet, 0xe001, createGlyph({ width: 16, height: 16, name: 'heart' }));
  assert.equal(nextIconCodepoint(glyphSet), 0xe002);
  // a gap should be reused rather than always advancing past the highest used value
  removeGlyph(glyphSet, 0xe000);
  assert.equal(nextIconCodepoint(glyphSet), 0xe000);
});

test('resizeGlyphSet pads/crops every glyph height uniformly, leaving width untouched', () => {
  const glyphSet = createGlyphSet({});
  const glyph = createGlyph({ width: 2, height: 2 });
  glyph.pixels.set([1, 1, 0, 1]); // full top row, bottom-left set
  setGlyph(glyphSet, 65, glyph);

  resizeGlyphSet(glyphSet, 4); // grow, top-left anchor: original content stays at (0,0)
  const grown = getGlyph(glyphSet, 65);
  assert.equal(grown.width, 2);
  assert.equal(grown.height, 4);
  assert.deepEqual(Array.from(grown.pixels), [1, 1, 0, 1, 0, 0, 0, 0]);
  assert.equal(glyphSet.meta.pixelsPerEm, 4);

  resizeGlyphSet(glyphSet, 1); // shrink back down crops away from the anchor
  const shrunk = getGlyph(glyphSet, 65);
  assert.equal(shrunk.height, 1);
  assert.deepEqual(Array.from(shrunk.pixels), [1, 1]);
});

test('glyphToCanvas/canvasToGlyphPixels round-trips a glyph exactly', () => {
  const glyph = createGlyph({ width: 3, height: 3 });
  glyph.pixels.set([1, 0, 1, 0, 1, 0, 1, 0, 1]);

  const canvas = glyphToCanvas(glyph);
  assert.equal(canvas.tier, 'simple');
  assert.equal(canvas.width, 3);
  assert.equal(canvas.height, 3);

  const roundTripped = canvasToGlyphPixels(canvas);
  assert.deepEqual(Array.from(roundTripped), Array.from(glyph.pixels));
});

test('canvasToGlyphPixels round-trips a glyph whose content is auto-cropped away from the canvas edges', () => {
  // A single "on" pixel in the interior of a 5x5 glyph: the underlying Grid
  // is auto-cropped to a 1x1 shape at offset (2,2), not a dense 5x5 buffer —
  // canvasToGlyphPixels has to expand that back out correctly.
  const glyph = createGlyph({ width: 5, height: 5 });
  glyph.pixels[2 * 5 + 2] = 1;

  const canvas = glyphToCanvas(glyph);
  const grid = canvas.layers[0].frames[0].grids[0];
  assert.equal(grid.width, 1);
  assert.equal(grid.height, 1);
  assert.equal(grid.offsetX, 2);
  assert.equal(grid.offsetY, 2);

  const roundTripped = canvasToGlyphPixels(canvas);
  assert.equal(roundTripped.length, 25);
  assert.deepEqual(Array.from(roundTripped), Array.from(glyph.pixels));
});

test('canvasToGlyphPixels returns all-zero for a canvas with no layers (empty glyph)', () => {
  const glyph = createGlyph({ width: 2, height: 2 });
  const canvas = glyphToCanvas(glyph); // all pixels off -> no auto layer ever created
  assert.equal(canvas.layers.length, 0);
  assert.deepEqual(Array.from(canvasToGlyphPixels(canvas)), [0, 0, 0, 0]);
});
