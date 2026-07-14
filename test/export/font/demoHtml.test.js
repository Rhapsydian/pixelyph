import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDemoHtml } from '../../../src/export/font/demoHtml.js';
import { createGlyphSet, createGlyph, setGlyph } from '../../../src/model/GlyphSet.js';

function glyph(name) {
  const g = createGlyph({ width: 10, height: 16, name });
  g.pixels.fill(1);
  return g;
}

test('generateDemoHtml embeds @font-face with base64 matching the given WOFF2 bytes, and one swatch per glyph', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'Demo Font' } });
  setGlyph(glyphSet, 'A'.codePointAt(0), glyph());
  setGlyph(glyphSet, 'B'.codePointAt(0), glyph());
  const woff2Bytes = new Uint8Array([1, 2, 3, 4, 5]);

  const html = generateDemoHtml(glyphSet, woff2Bytes);

  assert.ok(html.includes('@font-face'));
  assert.ok(html.includes(Buffer.from(woff2Bytes).toString('base64')));
  assert.equal((html.match(/class="icon-swatch"/g) ?? []).length, 2);
  assert.ok(html.includes('<textarea id="preview-text"'));
});

test('generateDemoHtml includes a WOFF fallback source when woffBytes is provided', () => {
  const glyphSet = createGlyphSet({});
  setGlyph(glyphSet, 65, glyph());
  const woff2Bytes = new Uint8Array([9, 9]);
  const woffBytes = new Uint8Array([7, 7, 7]);
  const html = generateDemoHtml(glyphSet, woff2Bytes, woffBytes);
  assert.ok(html.includes(Buffer.from(woffBytes).toString('base64')));
  assert.ok(html.includes("format('woff')"));
});

test('generateDemoHtml falls back to WOFF-only when woff2Bytes is omitted (WOFF2 export failed/timed out)', () => {
  const glyphSet = createGlyphSet({});
  setGlyph(glyphSet, 65, glyph());
  const woffBytes = new Uint8Array([3, 1, 4]);
  const html = generateDemoHtml(glyphSet, undefined, woffBytes);
  assert.ok(!html.includes("format('woff2')"));
  assert.ok(html.includes("format('woff')"));
  assert.ok(html.includes(Buffer.from(woffBytes).toString('base64')));
});

test('generateDemoHtml renders one clickable swatch per glyph plus a tiling test strip when at least one glyph is auto-assigned', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'Icon Set' } });
  setGlyph(glyphSet, 0xe000, glyph('Star'));
  setGlyph(glyphSet, 0xe001, glyph('Heart'));
  const html = generateDemoHtml(glyphSet, new Uint8Array([1]));

  assert.equal((html.match(/class="icon-swatch"/g) ?? []).length, 2);
  assert.ok(html.includes('id="tiling-strip"'));
  assert.ok(html.includes('Star'));
  assert.ok(html.includes('Heart'));
});

test('generateDemoHtml omits the tiling test strip when every glyph has a real typed codepoint', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'Character Set' } });
  setGlyph(glyphSet, 65, glyph());
  setGlyph(glyphSet, 66, glyph());
  const html = generateDemoHtml(glyphSet, new Uint8Array([1]));

  assert.ok(!html.includes('id="tiling-strip"'));
});

test('generateDemoHtml seeds the preview textarea with typed glyphs only, excluding auto-assigned codepoints', () => {
  const glyphSet = createGlyphSet({ meta: { familyName: 'Mixed Set' } });
  setGlyph(glyphSet, 65, glyph()); // 'A', typed
  setGlyph(glyphSet, 0xe000, glyph('Star')); // auto-assigned
  const html = generateDemoHtml(glyphSet, new Uint8Array([1]));

  const textareaMatch = /<textarea id="preview-text"[^>]*>([^<]*)<\/textarea>/.exec(html);
  assert.equal(textareaMatch[1], 'A');
});

test('generateDemoHtml includes a Pixelyph branding footer linking to the GitHub Pages demo', () => {
  const glyphSet = createGlyphSet({});
  setGlyph(glyphSet, 65, glyph());
  const html = generateDemoHtml(glyphSet, new Uint8Array([1]));

  assert.ok(html.includes('<footer'));
  assert.ok(html.includes('Made with'));
  assert.ok(html.includes('href="https://rhapsydian.github.io/pixelyph/"'));
  assert.ok(html.includes('>Pixelyph<'));
});
