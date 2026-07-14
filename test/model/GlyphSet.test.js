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
  nextAutoCodepoint,
  isAutoAssignedCodepoint,
  isDisplayableChar,
  nonDisplayableLabel,
  isEmptyGlyph,
  addBackgroundLayer,
  removeBackgroundLayer,
  addForegroundLayer,
  removeForegroundLayer,
  resizeGlyphSet,
  glyphToCanvas,
  canvasToGlyphPixels,
  flipGlyphH,
  flipGlyphV,
  rotateGlyph90,
} from '../../src/model/GlyphSet.js';

test('createGlyphSet has no kind field, defaults to default FontMeta', () => {
  const glyphSet = createGlyphSet({});
  assert.equal('kind' in glyphSet, false);
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
  const glyphSet = createGlyphSet({});
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

test('nextAutoCodepoint starts at U+E000 on an empty set', () => {
  const glyphSet = createGlyphSet({});
  assert.equal(nextAutoCodepoint(glyphSet), 0xe000);
});

test('nextAutoCodepoint skips already-used values', () => {
  const glyphSet = createGlyphSet({});
  setGlyph(glyphSet, 0xe000, createGlyph({ width: 16, height: 16, name: 'star' }));
  setGlyph(glyphSet, 0xe001, createGlyph({ width: 16, height: 16, name: 'heart' }));
  assert.equal(nextAutoCodepoint(glyphSet), 0xe002);
  // a gap should be reused rather than always advancing past the highest used value
  removeGlyph(glyphSet, 0xe000);
  assert.equal(nextAutoCodepoint(glyphSet), 0xe000);
});

test('isAutoAssignedCodepoint is true only within the Private Use Area', () => {
  assert.equal(isAutoAssignedCodepoint(0xe000), true);
  assert.equal(isAutoAssignedCodepoint(0xf8ff), true);
  assert.equal(isAutoAssignedCodepoint(0xe500), true);
  assert.equal(isAutoAssignedCodepoint(0xdfff), false); // just below PUA
  assert.equal(isAutoAssignedCodepoint(0xf900), false); // just above PUA
  assert.equal(isAutoAssignedCodepoint(65), false); // 'A'
});

test('isDisplayableChar is false for control/whitespace characters, true otherwise', () => {
  assert.equal(isDisplayableChar(0x20), false); // space
  assert.equal(isDisplayableChar(0x09), false); // tab
  assert.equal(isDisplayableChar(0x0a), false); // line feed
  assert.equal(isDisplayableChar(0x0d), false); // carriage return
  assert.equal(isDisplayableChar(0x7f), false); // DEL
  assert.equal(isDisplayableChar(0x85), false); // C1 control
  assert.equal(isDisplayableChar(65), true); // 'A'
  assert.equal(isDisplayableChar(0x2764), true); // heart
});

test('nonDisplayableLabel returns a human label for known codepoints, null otherwise', () => {
  assert.equal(nonDisplayableLabel(0x20), 'Space');
  assert.equal(nonDisplayableLabel(0x09), 'Tab');
  assert.equal(nonDisplayableLabel(0x0a), 'Line Feed');
  assert.equal(nonDisplayableLabel(0x0d), 'Carriage Return');
  assert.equal(nonDisplayableLabel(0x01), null); // unlabeled control char
});

test('isEmptyGlyph is true only when every present buffer is all-zero', () => {
  const glyph = createGlyph({ width: 2, height: 2 });
  assert.equal(isEmptyGlyph(glyph), true);

  glyph.pixels[0] = 1;
  assert.equal(isEmptyGlyph(glyph), false);
  glyph.pixels[0] = 0;

  addBackgroundLayer(glyph);
  assert.equal(isEmptyGlyph(glyph), true); // new layer is blank
  glyph.backgroundPixels[0] = 1;
  assert.equal(isEmptyGlyph(glyph), false);
  removeBackgroundLayer(glyph);
  assert.equal(isEmptyGlyph(glyph), true);

  addForegroundLayer(glyph);
  glyph.foregroundPixels[3] = 1;
  assert.equal(isEmptyGlyph(glyph), false);
  removeForegroundLayer(glyph);
  assert.equal(isEmptyGlyph(glyph), true);
});

test('addBackgroundLayer/addForegroundLayer allocate blank same-size buffers; remove clears them', () => {
  const glyph = createGlyph({ width: 3, height: 4 });
  assert.equal(glyph.backgroundPixels, undefined);
  assert.equal(glyph.foregroundPixels, undefined);

  addBackgroundLayer(glyph);
  assert.equal(glyph.backgroundPixels.length, 12);
  assert.deepEqual(Array.from(glyph.backgroundPixels), new Array(12).fill(0));

  addForegroundLayer(glyph);
  assert.equal(glyph.foregroundPixels.length, 12);

  removeBackgroundLayer(glyph);
  assert.equal(glyph.backgroundPixels, undefined);
  removeForegroundLayer(glyph);
  assert.equal(glyph.foregroundPixels, undefined);
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

// --- Flip/rotate (Checkpoint 6) ---

test('flipGlyphH/flipGlyphV mirror a glyph\'s own buffer, width/height unchanged', () => {
  const glyph = createGlyph({ width: 3, height: 2 });
  glyph.pixels.set([1, 0, 0, 0, 1, 1]);

  flipGlyphH(glyph);
  assert.equal(glyph.width, 3);
  assert.equal(glyph.height, 2);
  assert.deepEqual(Array.from(glyph.pixels), [0, 0, 1, 1, 1, 0]);

  flipGlyphV(glyph);
  assert.deepEqual(Array.from(glyph.pixels), [1, 1, 0, 0, 0, 1]);
});

test('rotateGlyph90 needs no re-crop when the rotated height already matches pixelsPerEm', () => {
  const glyphSet = createGlyphSet({}); // pixelsPerEm defaults to 16
  const glyph = createGlyph({ width: 16, height: 16 }); // square: rotated height = old width = 16
  glyph.pixels[0] = 1;
  rotateGlyph90(glyphSet, glyph);
  assert.equal(glyph.width, 16);
  assert.equal(glyph.height, 16);
});

test('rotateGlyph90 re-crops/pads back to pixelsPerEm when rotation changes the height', () => {
  const glyphSet = createGlyphSet({}); // pixelsPerEm = 16
  const glyph = createGlyph({ width: 4, height: 16 }); // narrow glyph
  glyph.pixels.fill(1);

  rotateGlyph90(glyphSet, glyph);

  // post-rotate (before recrop): width=16 (old height), height=4 (old width) -> padded back to 16
  assert.equal(glyph.width, 16);
  assert.equal(glyph.height, 16);
  assert.equal(glyph.pixels.length, 16 * 16);
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
