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
  const glyphSet = createGlyphSet({ meta: { familyName: 'My Icons' } });
  setGlyph(glyphSet, 0xe000, iconGlyph('Star'));
  setGlyph(glyphSet, 0xe001, iconGlyph('Heart'));

  const { css, manifest } = generateIconFontCss(glyphSet, { formats: { woff2: true, woff: true } });

  assert.ok(css.includes('@font-face'));
  assert.ok(css.includes('font-family: "My Icons"'));
  assert.ok(css.includes('url("my-icons.woff2")'));
  assert.ok(css.includes('.icon-star::before {\n  content: "\\e000";\n}'));
  assert.ok(css.includes('.icon-heart::before {\n  content: "\\e001";\n}'));
  assert.deepEqual(manifest, { star: 'e000', heart: 'e001' });
});

test('generateIconFontCss slugifies names and de-duplicates collisions', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'Icons' } });
  setGlyph(glyphSet, 0xe000, iconGlyph('My Star!'));
  setGlyph(glyphSet, 0xe001, iconGlyph('My Star!'));
  setGlyph(glyphSet, 0xe002, iconGlyph(''));

  const { manifest } = generateIconFontCss(glyphSet);
  // An empty/unslugifiable name falls back to the glyph's own hex codepoint
  // (not a generic 'icon') so bulk-generated classes stay distinguishable.
  assert.deepEqual(manifest, { 'my-star': 'e000', 'my-star-2': 'e001', e002: 'e002' });
});

test('generateIconFontCss works across a mixed set of typed, auto-assigned, and unnamed glyphs', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'Mixed' } });
  setGlyph(glyphSet, 65, iconGlyph('Cap A')); // typed, named
  setGlyph(glyphSet, 0xe000, iconGlyph('Star')); // auto-assigned, named
  setGlyph(glyphSet, 66, iconGlyph('')); // typed, unnamed -> hex fallback

  const { css, manifest } = generateIconFontCss(glyphSet);
  assert.deepEqual(manifest, { 'cap-a': '41', star: 'e000', '42': '42' });
  assert.ok(css.includes('.icon-cap-a::before'));
  assert.ok(css.includes('.icon-star::before'));
  assert.ok(css.includes('.icon-42::before'));
});

test('generateIconFontCss only references formats actually passed in — never a file that will not exist', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'Icons' } });
  setGlyph(glyphSet, 0xe000, iconGlyph('Star'));

  const otfOnly = generateIconFontCss(glyphSet, { formats: { otf: true } });
  assert.ok(otfOnly.css.includes('url("icons.otf") format("opentype")'));
  assert.ok(!otfOnly.css.includes('.woff2'));
  assert.ok(!otfOnly.css.includes('"icons.woff"'));

  const woffOnly = generateIconFontCss(glyphSet, { formats: { woff: true } });
  assert.ok(woffOnly.css.includes('url("icons.woff") format("woff")'));
  assert.ok(!woffOnly.css.includes('.otf'));
});

test('generateIconFontCss defaults to referencing OTF when no formats option is given', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'Icons' } });
  setGlyph(glyphSet, 0xe000, iconGlyph('Star'));
  const { css } = generateIconFontCss(glyphSet);
  assert.ok(css.includes('url("icons.otf") format("opentype")'));
});

test('generateIconFontCss omits the src list rather than referencing a nonexistent file when no format is selected', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'Icons' } });
  setGlyph(glyphSet, 0xe000, iconGlyph('Star'));
  const { css } = generateIconFontCss(glyphSet, { formats: {} });
  assert.ok(!css.includes('src:'));
  assert.ok(css.includes('@font-face'));
});
