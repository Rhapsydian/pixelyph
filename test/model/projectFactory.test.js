import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  DEFAULT_PALETTE,
  DEFAULT_FILLS,
  DEFAULT_STYLES,
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
  assert.deepEqual(canvas.palette.colors, DEFAULT_PALETTE);
});

test('buildDrawDocument produces independent canvases each call', () => {
  const a = buildDrawDocument();
  const b = buildDrawDocument();
  a.palette.colors.push('#ff0000');
  assert.equal(b.palette.colors.length, DEFAULT_PALETTE.length, 'palettes should be independent arrays');
});

test('buildDrawDocument uses the standard default fills and styles', () => {
  const canvas = buildDrawDocument();
  assert.deepEqual(canvas.palette.fills, DEFAULT_FILLS);
  assert.deepEqual(canvas.palette.styles, DEFAULT_STYLES);
});

test('buildDrawDocument produces independent fills/styles arrays each call', () => {
  const a = buildDrawDocument();
  const b = buildDrawDocument();
  a.palette.fills.push({ id: 'extra-fill', type: 'linear-gradient' });
  a.palette.styles.push({ id: 'extra-style', fill: '#123456' });
  assert.equal(b.palette.fills.length, DEFAULT_FILLS.length, 'fills should be independent arrays');
  assert.equal(b.palette.styles.length, DEFAULT_STYLES.length, 'styles should be independent arrays');
});

test('every default style has a non-null fill (applying a style replaces fill+stroke+effects wholesale)', () => {
  for (const style of DEFAULT_STYLES) {
    assert.ok(style.fill, `${style.name} should have a non-null fill`);
  }
});

test('every default style has an effects array (Layer.js\'s LayerStyle shape requires it — cloneLayerStyle calls .map() on it unconditionally, so a missing effects field throws when the style is applied)', () => {
  for (const style of DEFAULT_STYLES) {
    assert.ok(Array.isArray(style.effects), `${style.name} should have an effects array, got ${style.effects}`);
  }
});

// --- buildGlyphDocument ---

test('buildGlyphDocument produces a GlyphSet with no kind field', () => {
  const { glyphSet } = buildGlyphDocument();
  assert.equal('kind' in glyphSet, false);
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
  const { initialPreset } = buildGlyphDocument({ initialPreset: 'symbols' });
  assert.equal(initialPreset, 'symbols');
});

test('buildGlyphDocument defaults initialPreset to basic-latin', () => {
  const { initialPreset } = buildGlyphDocument();
  assert.equal(initialPreset, DEFAULT_INITIAL_CHARSET_PRESET);
  assert.equal(initialPreset, 'basic-latin');
});

test('buildGlyphDocument seeds one bare glyph when initialPreset is none', () => {
  const { glyphSet } = buildGlyphDocument({ familyName: 'Test', initialPreset: 'none' });
  assert.equal(glyphSet.glyphs.size, 1);
  const [[codepoint, glyph]] = glyphSet.glyphs.entries();
  assert.equal(codepoint, 0xe000, 'seeded glyph gets the first auto-assigned PUA codepoint');
  assert.equal(glyph.name, '');
});

test('buildGlyphDocument eagerly creates one empty-grid glyph per codepoint in the chosen initial preset', () => {
  const { glyphSet } = buildGlyphDocument({ familyName: 'Test', initialPreset: 'symbols' });
  assert.equal(glyphSet.glyphs.size, 36); // SYMBOLS_CODEPOINTS' length, per charsetPresets.js
  const heart = glyphSet.glyphs.get(0x2764);
  assert.ok(heart);
  assert.equal(heart.name, '');
  assert.equal(Array.from(heart.pixels).every((v) => v === 0), true, 'eagerly-created glyphs start with an empty grid');
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
