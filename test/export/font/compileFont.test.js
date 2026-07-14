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
  const glyphSet = createGlyphSet({});
  setGlyph(glyphSet, 65, filledGlyph(8, 16));
  const buffer = fontToArrayBuffer(compileFont(glyphSet));
  const signature = String.fromCharCode(...new Uint8Array(buffer.slice(0, 4)));
  assert.equal(signature, 'OTTO');
});

test('compileFont gives any named glyph a unique, slugified name — regardless of whether its codepoint is typed or auto-assigned', () => {
  const glyphSet = createGlyphSet({});
  const star = filledGlyph(12, 16);
  star.name = 'My Star!';
  setGlyph(glyphSet, 0xe000, star);
  const font = compileFont(glyphSet);
  assert.equal(font.glyphs.get(1).name, 'icon-my-star');
});

test('compileFont falls back to a hex glyph name when a glyph has no name', () => {
  const glyphSet = createGlyphSet({});
  setGlyph(glyphSet, 65, filledGlyph(8, 16)); // no name set
  const font = compileFont(glyphSet);
  assert.equal(font.glyphs.get(1).name, 'uni0041');
});

test('iconTilePadding of 0 makes two equal-width auto-assigned glyphs touch with zero gap', () => {
  const glyphSet = createGlyphSet({ meta: { unitsPerEm: 1000, pixelsPerEm: 16, iconTilePadding: 0 } });
  setGlyph(glyphSet, 0xe000, filledGlyph(10, 16));
  setGlyph(glyphSet, 0xe001, filledGlyph(10, 16));
  const font = compileFont(glyphSet);
  const a = font.glyphs.get(1); // .notdef, a, b
  const b = font.glyphs.get(2);
  const scale = 1000 / 16;
  const inkEndA = a.leftSideBearing + 10 * scale; // measured from A's own origin
  const originB = a.advanceWidth; // B's origin, since A starts at 0
  const inkStartB = originB + b.leftSideBearing;
  assert.equal(inkStartB - inkEndA, 0);
});

test('a positive iconTilePadding inserts the same exact gap between any pair of equal-width auto-assigned glyphs', () => {
  const padding = 2;
  const glyphSet = createGlyphSet({ meta: { unitsPerEm: 1000, pixelsPerEm: 16, iconTilePadding: padding } });
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

test('compileFont handles a mixed set: typed-named, auto-assigned-named, and bare (unnamed typed) glyphs together', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'Mixed Font', unitsPerEm: 1000, pixelsPerEm: 16, iconTilePadding: 1 } });

  const typedNamed = filledGlyph(10, 16);
  typedNamed.name = 'Cap A';
  typedNamed.leftSideBearing = 1;
  typedNamed.advanceWidth = 12;
  setGlyph(glyphSet, 65, typedNamed); // real typed codepoint, named, own stored bearing/advance

  const bare = filledGlyph(6, 16); // real typed codepoint, no name, no stored overrides
  setGlyph(glyphSet, 66, bare);

  const autoNamed = filledGlyph(8, 16);
  autoNamed.name = 'Star';
  setGlyph(glyphSet, 0xe000, autoNamed); // auto-assigned codepoint, named

  const font = compileFont(glyphSet);
  const scale = 1000 / 16;
  // Sorted by codepoint: .notdef, 65 ('A'), 66 ('B'), 0xe000 (star)
  const a = font.glyphs.get(1);
  const b = font.glyphs.get(2);
  const star = font.glyphs.get(3);

  assert.equal(a.name, 'icon-cap-a'); // named -> icon- prefix regardless of typed/auto origin
  assert.equal(a.advanceWidth, 12 * scale); // typed: uses the glyph's own stored advanceWidth
  assert.equal(a.leftSideBearing, 1 * scale); // typed: uses the glyph's own stored leftSideBearing

  assert.equal(b.name, 'uni0042'); // no name -> hex fallback
  assert.equal(b.advanceWidth, 6 * scale); // typed, no stored advanceWidth override -> falls back to width
  assert.equal(b.leftSideBearing, 0);

  assert.equal(star.name, 'icon-star');
  assert.equal(star.advanceWidth, 8 * scale + 2 * 1 * scale); // auto-assigned: tiling formula with padding=1
  assert.equal(star.leftSideBearing, 1 * scale); // auto-assigned: padding
});

test('compileFont ignores the optional background/foreground layers entirely (scope boundary — model-only, no export wiring yet)', () => {
  // Two otherwise-identical glyphs, differing only in whether the optional
  // layers are present — compileFont only ever reads `.pixels`, so both
  // must compile to the exact same path/advanceWidth.
  const plain = createGlyphSet({});
  setGlyph(plain, 65, filledGlyph(8, 16));

  const withLayers = createGlyphSet({});
  const layered = filledGlyph(8, 16);
  layered.backgroundPixels = new Uint8Array(layered.pixels.length).fill(1);
  layered.foregroundPixels = new Uint8Array(layered.pixels.length).fill(1);
  setGlyph(withLayers, 65, layered);

  const fontA = compileFont(plain);
  const fontB = compileFont(withLayers);
  const glyphA = fontA.glyphs.get(1); // .notdef, A
  const glyphB = fontB.glyphs.get(1);
  assert.equal(glyphA.path.commands.length, glyphB.path.commands.length);
  assert.equal(glyphA.advanceWidth, glyphB.advanceWidth);
});
