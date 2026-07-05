import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateIconFontCss } from '../../../src/export/font/iconFontCss.js';
import { createGlyphSet, createGlyph, setGlyph } from '../../../src/model/GlyphSet.js';

function iconGlyph(name) {
  const glyph = createGlyph({ width: 12, height: 16, name });
  glyph.pixels.fill(1);
  return glyph;
}

test('generateIconFontCss emits a @font-face and one rule + manifest entry per glyph', () => {
  const glyphSet = createGlyphSet({ kind: 'icons', meta: { familyName: 'My Icons' } });
  setGlyph(glyphSet, 0xe000, iconGlyph('Star'));
  setGlyph(glyphSet, 0xe001, iconGlyph('Heart'));

  const { css, manifest } = generateIconFontCss(glyphSet);

  assert.ok(css.includes('@font-face'));
  assert.ok(css.includes('font-family: "My Icons"'));
  assert.ok(css.includes('url("my-icons.woff2")'));
  assert.ok(css.includes('.icon-star::before {\n  content: "\\e000";\n}'));
  assert.ok(css.includes('.icon-heart::before {\n  content: "\\e001";\n}'));
  assert.deepEqual(manifest, { star: 'e000', heart: 'e001' });
});

test('generateIconFontCss slugifies names and de-duplicates collisions', () => {
  const glyphSet = createGlyphSet({ kind: 'icons', meta: { familyName: 'Icons' } });
  setGlyph(glyphSet, 0xe000, iconGlyph('My Star!'));
  setGlyph(glyphSet, 0xe001, iconGlyph('My Star!'));
  setGlyph(glyphSet, 0xe002, iconGlyph(''));

  const { manifest } = generateIconFontCss(glyphSet);
  assert.deepEqual(manifest, { 'my-star': 'e000', 'my-star-2': 'e001', icon: 'e002' });
});
