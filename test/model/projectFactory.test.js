import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  DEFAULT_PALETTE,
  DEFAULT_INITIAL_CHARSET_PRESET,
  buildDrawDocument,
  buildGlyphDocument,
} from '../../src/model/projectFactory.js';

// --- buildDrawDocument ---

test('buildDrawDocument produces a canvas with the standard default dimensions', () => {
  const canvas = buildDrawDocument();
  assert.equal(canvas.width, DEFAULT_WIDTH);
  assert.equal(canvas.height, DEFAULT_HEIGHT);
});

test('buildDrawDocument uses the standard default palette', () => {
  const canvas = buildDrawDocument();
  assert.deepEqual(canvas.palette, DEFAULT_PALETTE);
});

test('buildDrawDocument produces independent canvases each call', () => {
  const a = buildDrawDocument();
  const b = buildDrawDocument();
  a.palette.push('#ff0000');
  assert.equal(b.palette.length, DEFAULT_PALETTE.length, 'palettes should be independent arrays');
});

// --- buildGlyphDocument ---

test('buildGlyphDocument defaults to character kind', () => {
  const { glyphSet } = buildGlyphDocument();
  assert.equal(glyphSet.kind, 'characters');
});

test('buildGlyphDocument threads kind through to the GlyphSet', () => {
  const { glyphSet } = buildGlyphDocument({ kind: 'icons' });
  assert.equal(glyphSet.kind, 'icons');
});

test('buildGlyphDocument threads familyName through to FontMeta', () => {
  const { glyphSet } = buildGlyphDocument({ familyName: 'Pixel Serif' });
  assert.equal(glyphSet.meta.familyName, 'Pixel Serif');
});

test('buildGlyphDocument defaults familyName to Untitled', () => {
  const { glyphSet } = buildGlyphDocument();
  assert.equal(glyphSet.meta.familyName, 'Untitled');
});

test('buildGlyphDocument captures initialPreset in the returned object', () => {
  const { initialPreset } = buildGlyphDocument({ initialPreset: 'digits' });
  assert.equal(initialPreset, 'digits');
});

test('buildGlyphDocument defaults initialPreset to basic-latin', () => {
  const { initialPreset } = buildGlyphDocument();
  assert.equal(initialPreset, DEFAULT_INITIAL_CHARSET_PRESET);
  assert.equal(initialPreset, 'basic-latin');
});

test('buildGlyphDocument starts with an empty glyphs map', () => {
  const { glyphSet } = buildGlyphDocument({ kind: 'characters', familyName: 'Test' });
  assert.equal(glyphSet.glyphs.size, 0);
});

test('buildGlyphDocument preserves default FontMeta fields not in options', () => {
  const { glyphSet } = buildGlyphDocument({ familyName: 'Custom' });
  assert.equal(glyphSet.meta.pixelsPerEm, 16); // default from createFontMeta
  assert.equal(glyphSet.meta.styleName, 'Regular');
});

// --- pixelsPerEm and defaultGlyphWidth ---

test('buildGlyphDocument threads pixelsPerEm through to FontMeta', () => {
  const { glyphSet } = buildGlyphDocument({ pixelsPerEm: 24 });
  assert.equal(glyphSet.meta.pixelsPerEm, 24);
});

test('buildGlyphDocument auto-computes baselineRow as 75% of pixelsPerEm', () => {
  const { glyphSet } = buildGlyphDocument({ pixelsPerEm: 24 });
  assert.equal(glyphSet.meta.baselineRow, 18); // Math.round(24 * 0.75) = 18
});

test('buildGlyphDocument baselineRow at default pixelsPerEm matches createFontMeta default', () => {
  const { glyphSet } = buildGlyphDocument({ pixelsPerEm: 16 });
  assert.equal(glyphSet.meta.baselineRow, 12); // Math.round(16 * 0.75) = 12
});

test('buildGlyphDocument threads explicit defaultGlyphWidth through to FontMeta', () => {
  const { glyphSet } = buildGlyphDocument({ defaultGlyphWidth: 10 });
  assert.equal(glyphSet.meta.defaultGlyphWidth, 10);
});

test('buildGlyphDocument defaults defaultGlyphWidth to null (derive at glyph-creation time)', () => {
  const { glyphSet } = buildGlyphDocument();
  assert.equal(glyphSet.meta.defaultGlyphWidth, null);
});
