import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileFont, fontToArrayBuffer } from '../../../src/export/font/compileFont.js';
import { toWoff, toWoff2 } from '../../../src/export/font/woff.js';
import { createGlyphSet, createGlyph, setGlyph } from '../../../src/model/GlyphSet.js';

function sampleFontBuffer() {
  const glyphSet = createGlyphSet({ kind: 'characters' });
  const glyph = createGlyph({ width: 8, height: 16 });
  glyph.pixels.fill(1);
  setGlyph(glyphSet, 65, glyph);
  return fontToArrayBuffer(compileFont(glyphSet));
}

test('toWoff produces a buffer with the WOFF magic signature', () => {
  const woff = toWoff(sampleFontBuffer());
  const signature = String.fromCharCode(...woff.slice(0, 4));
  assert.equal(signature, 'wOFF');
});

test('toWoff2 produces a buffer with the WOFF2 magic signature', async () => {
  const woff2 = await toWoff2(sampleFontBuffer());
  const signature = String.fromCharCode(...woff2.slice(0, 4));
  assert.equal(signature, 'wOF2');
});
