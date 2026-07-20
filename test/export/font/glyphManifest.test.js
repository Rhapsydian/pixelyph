import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateGlyphManifest } from '../../../src/export/font/glyphManifest.js';
import { createGlyphSet, createGlyph, setGlyph } from '../../../src/model/GlyphSet.js';

function iconGlyph(name, overrides = {}) {
  const glyph = createGlyph({ width: 12, height: 16, name, ...overrides });
  glyph.pixels.fill(1);
  return glyph;
}

test('generateGlyphManifest emits a meta block as a straight passthrough of glyphSet.meta', () => {
  const glyphSet = createGlyphSet({
    meta: {
      familyName: 'My Icons',
      styleName: 'Bold',
      pixelsPerEm: 16,
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      baselineRow: 12,
      horizontalPadding: 1,
    },
  });

  const { meta } = generateGlyphManifest(glyphSet);
  assert.deepEqual(meta, {
    familyName: 'My Icons',
    styleName: 'Bold',
    pixelsPerEm: 16,
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    baselineRow: 12,
    horizontalPadding: 1,
  });
  // Internal-only field, not part of the spec — must not leak into the manifest.
  assert.ok(!('defaultGlyphWidth' in meta));
});

test('generateGlyphManifest keys glyph entries by codepoint and includes full per-glyph metrics', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'My Icons' } });
  setGlyph(glyphSet, 0xe000, iconGlyph('Star'));

  const { glyphs } = generateGlyphManifest(glyphSet);
  assert.deepEqual(Object.keys(glyphs), ['e000']);
  const entry = glyphs.e000;
  assert.equal(entry.codepoint, 'e000');
  assert.equal(entry.slug, 'star');
  assert.equal(entry.name, 'Star');
  assert.equal(entry.width, 12);
  assert.equal(entry.height, 16);
  assert.equal(typeof entry.advanceWidth, 'number');
  assert.equal(typeof entry.offsetX, 'number');
});

test('generateGlyphManifest survives a slug re-shuffle because codepoint, not slug, is the key', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'Icons' } });
  setGlyph(glyphSet, 0xe000, iconGlyph('My Star!'));
  setGlyph(glyphSet, 0xe001, iconGlyph('My Star!'));
  setGlyph(glyphSet, 0xe002, iconGlyph(''));

  const { glyphs } = generateGlyphManifest(glyphSet);
  assert.deepEqual(Object.keys(glyphs).sort(), ['e000', 'e001', 'e002']);
  assert.equal(glyphs.e000.slug, 'my-star');
  assert.equal(glyphs.e001.slug, 'my-star-2');
  // Empty/unslugifiable name falls back to the glyph's own hex codepoint.
  assert.equal(glyphs.e002.slug, 'e002');
});

test('generateGlyphManifest works across a mixed set of typed, auto-assigned, and unnamed glyphs', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'Mixed' } });
  setGlyph(glyphSet, 65, iconGlyph('Cap A')); // typed, named
  setGlyph(glyphSet, 0xe000, iconGlyph('Star')); // auto-assigned, named
  setGlyph(glyphSet, 66, iconGlyph('')); // typed, unnamed -> hex fallback

  const { glyphs } = generateGlyphManifest(glyphSet);
  assert.deepEqual(Object.keys(glyphs).sort(), ['41', '42', 'e000']);
  assert.equal(glyphs['41'].slug, 'cap-a');
  assert.equal(glyphs.e000.slug, 'star');
  assert.equal(glyphs['42'].slug, '42');
});

test('generateGlyphManifest agrees with glyphMetrics for advanceWidth/offsetX', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'Icons', horizontalPadding: 2 } });
  setGlyph(glyphSet, 65, iconGlyph('Cap A', { width: 10, advanceWidth: 14, leftSideBearing: 1 }));

  const { glyphs } = generateGlyphManifest(glyphSet);
  // Typed codepoint: offsetX = leftSideBearing + padding, advanceWidth = stored advanceWidth + 2*padding.
  assert.equal(glyphs['41'].offsetX, 3);
  assert.equal(glyphs['41'].advanceWidth, 18);
});
