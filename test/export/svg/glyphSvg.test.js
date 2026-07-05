import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glyphToSvg } from '../../../src/export/svg/glyphSvg.js';
import { createGlyph } from '../../../src/model/GlyphSet.js';

test('glyphToSvg wraps the traced path in a viewBox matching the glyph dimensions', () => {
  const glyph = createGlyph({ width: 3, height: 3 });
  glyph.pixels.set([1, 1, 1, 1, 0, 1, 1, 1, 1]); // a 3x3 ring
  const svg = glyphToSvg(glyph);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 3">'));
  assert.ok(svg.includes('fill="#000000"'));
  assert.ok(svg.includes('fill-rule="evenodd"'));
  assert.ok(svg.endsWith('</svg>'));
});

test('glyphToSvg respects a custom fill color', () => {
  const glyph = createGlyph({ width: 2, height: 2 });
  glyph.pixels.set([1, 1, 1, 1]);
  const svg = glyphToSvg(glyph, { fill: '#ff00ff' });
  assert.ok(svg.includes('fill="#ff00ff"'));
});

test('glyphToSvg on an empty glyph produces no <path>', () => {
  const glyph = createGlyph({ width: 4, height: 4 });
  const svg = glyphToSvg(glyph);
  assert.equal(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"></svg>');
});
