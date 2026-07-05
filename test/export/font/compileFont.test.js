import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opentype } from '../../../src/export/font/opentypeCompat.js';
import { compileFont, fontToArrayBuffer } from '../../../src/export/font/compileFont.js';
import { createGlyphSet, createGlyph, setGlyph } from '../../../src/model/GlyphSet.js';

function filledGlyph(width, height) {
  const glyph = createGlyph({ width, height });
  glyph.pixels.fill(1);
  return glyph;
}

test('compileFont compiles a small character font and round-trips through opentype.parse', () => {
  const glyphSet = createGlyphSet({
    kind: 'characters',
    meta: { familyName: 'Test Font', styleName: 'Regular', unitsPerEm: 1000, pixelsPerEm: 10, baselineRow: 8, ascender: 800, descender: -200 },
  });
  setGlyph(glyphSet, 'A'.codePointAt(0), filledGlyph(8, 10));
  setGlyph(glyphSet, 'B'.codePointAt(0), filledGlyph(6, 10));

  const font = compileFont(glyphSet);
  const parsed = opentype.parse(fontToArrayBuffer(font));

  assert.equal(parsed.unitsPerEm, 1000);
  assert.equal(parsed.glyphs.length, 3); // .notdef + A + B
  assert.equal(parsed.getEnglishName('fontFamily'), 'Test Font');

  const scale = 1000 / 10;
  assert.equal(parsed.charToGlyph('A').advanceWidth, 8 * scale);
  assert.equal(parsed.charToGlyph('B').advanceWidth, 6 * scale);
  assert.equal(parsed.charToGlyph('A').name, 'uni0041');
});

test('compileFont always produces CFF-flavored OpenType output (OTTO signature)', () => {
  const glyphSet = createGlyphSet({ kind: 'characters' });
  setGlyph(glyphSet, 65, filledGlyph(8, 16));
  const buffer = fontToArrayBuffer(compileFont(glyphSet));
  const signature = String.fromCharCode(...new Uint8Array(buffer.slice(0, 4)));
  assert.equal(signature, 'OTTO');
});

test('compileFont gives icon glyphs unique, slugified names based on their user-entered name', () => {
  const glyphSet = createGlyphSet({ kind: 'icons' });
  const star = filledGlyph(12, 16);
  star.name = 'My Star!';
  setGlyph(glyphSet, 0xe000, star);
  const font = compileFont(glyphSet);
  assert.equal(font.glyphs.get(1).name, 'icon-my-star');
});

test('iconTilePadding of 0 makes two equal-width icon glyphs touch with zero gap', () => {
  const glyphSet = createGlyphSet({ kind: 'icons', meta: { unitsPerEm: 1000, pixelsPerEm: 16, iconTilePadding: 0 } });
  setGlyph(glyphSet, 0xe000, filledGlyph(10, 16));
  setGlyph(glyphSet, 0xe001, filledGlyph(10, 16));
  const font = compileFont(glyphSet);
  const a = font.glyphs.get(1); // .notdef, iconA, iconB
  const b = font.glyphs.get(2);
  const scale = 1000 / 16;
  const inkEndA = a.leftSideBearing + 10 * scale; // measured from A's own origin
  const originB = a.advanceWidth; // B's origin, since A starts at 0
  const inkStartB = originB + b.leftSideBearing;
  assert.equal(inkStartB - inkEndA, 0);
});

test('a positive iconTilePadding inserts the same exact gap between any pair of equal-width icon glyphs', () => {
  const padding = 2;
  const glyphSet = createGlyphSet({ kind: 'icons', meta: { unitsPerEm: 1000, pixelsPerEm: 16, iconTilePadding: padding } });
  setGlyph(glyphSet, 0xe000, filledGlyph(10, 16));
  setGlyph(glyphSet, 0xe001, filledGlyph(10, 16));
  const font = compileFont(glyphSet);
  const a = font.glyphs.get(1);
  const b = font.glyphs.get(2);
  const scale = 1000 / 16;
  const inkEndA = a.leftSideBearing + 10 * scale;
  const inkStartB = a.advanceWidth + b.leftSideBearing;
  assert.equal(inkStartB - inkEndA, 2 * padding * scale);
});
