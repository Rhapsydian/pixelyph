import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, paintCell, resizeCanvas, addLayer } from '../../src/model/Canvas.js';
import { createGlyphSet, createGlyph, setGlyph } from '../../src/model/GlyphSet.js';
import {
  serializeProject,
  deserializeProject,
  saveProjectToString,
  loadProjectFromString,
  serializeGlyphSetProject,
  deserializeGlyphSetProject,
  saveGlyphProjectToString,
  loadGlyphProjectFromString,
  PIXELYPH_VERSION,
} from '../../src/io/projectFile.js';

test('serializeProject stamps the current pixelyphVersion and kind: draw', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  const doc = serializeProject(canvas);
  assert.equal(doc.pixelyphVersion, PIXELYPH_VERSION);
  assert.equal(doc.kind, 'draw');
});

test('pixel data is base64-encoded, not a raw JSON array', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  const doc = serializeProject(canvas);
  const encoded = doc.canvas.layers[0].frames[0].pixels;
  assert.equal(typeof encoded, 'string');
  assert.doesNotMatch(encoded, /^\[/);
});

test('round-trips a multi-layer, multi-color canvas exactly', () => {
  const canvas = createCanvas({ width: 5, height: 5, palette: ['#ff0000', '#00ff00', '#0000ff'] });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 1, '#00ff00');
  paintCell(canvas, 2, 2, '#0000ff');
  paintCell(canvas, 1, 1, '#ff0000'); // exercise autoLayerSync bookkeeping before saving
  canvas.symmetryMode = 'x';

  const restored = loadProjectFromString(saveProjectToString(canvas));
  assert.deepStrictEqual(restored, canvas);
});

test('round-trip preserves canvas dimensions and layer offsets after a resize', () => {
  const canvas = createCanvas({ width: 4, height: 4 });
  paintCell(canvas, 0, 0, '#ff0000');
  resizeCanvas(canvas, 6, 6, 'center');

  const restored = loadProjectFromString(saveProjectToString(canvas));
  assert.deepStrictEqual(restored, canvas);
});

test('an empty canvas (no layers) round-trips too', () => {
  const canvas = createCanvas({ width: 3, height: 3 });
  const restored = deserializeProject(serializeProject(canvas));
  assert.deepStrictEqual(restored, canvas);
});

test('deserializeProject rejects a non-draw document', () => {
  assert.throws(() => deserializeProject({ pixelyphVersion: 1, kind: 'glyph', glyphSet: {} }), /expected kind 'draw'/);
});

test('round-trips an advanced-tier canvas with gradient fill, stroke, effects, and activeLayerId exactly', () => {
  const canvas = createCanvas({ width: 3, height: 3 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'styled' });
  paintCell(canvas, 0, 0, 'x');
  layer.style.fill = { type: 'linear-gradient', angle: 45, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  layer.style.stroke = { color: '#00ff00', width: 0.2, linecap: 'round', linejoin: 'round', dashArray: [0.5, 0.25] };
  layer.style.effects = [{ type: 'drop-shadow', dx: 0.2, dy: 0.2, blur: 0.1, color: '#000', opacity: 0.5 }];
  layer.offset = { x: -2, y: 3 };
  canvas.activeLayerId = layer.id;

  const restored = loadProjectFromString(saveProjectToString(canvas));
  assert.deepStrictEqual(restored, canvas);
});

test('serializeGlyphSetProject stamps the current pixelyphVersion and kind: glyph', () => {
  const glyphSet = createGlyphSet({ kind: 'characters' });
  const doc = serializeGlyphSetProject(glyphSet);
  assert.equal(doc.pixelyphVersion, PIXELYPH_VERSION);
  assert.equal(doc.kind, 'glyph');
});

test('glyph pixel data is base64-encoded, not a raw JSON array', () => {
  const glyphSet = createGlyphSet({});
  const glyph = createGlyph({ width: 2, height: 2 });
  glyph.pixels.set([1, 0, 0, 1]);
  setGlyph(glyphSet, 65, glyph);
  const doc = serializeGlyphSetProject(glyphSet);
  const encoded = doc.glyphSet.glyphs[0][1].pixels;
  assert.equal(typeof encoded, 'string');
  assert.doesNotMatch(encoded, /^\[/);
});

test('round-trips a multi-glyph character GlyphSet exactly', () => {
  const glyphSet = createGlyphSet({ kind: 'characters', meta: { familyName: 'Test Font' } });
  const a = createGlyph({ width: 5, height: 16, name: 'A' });
  a.pixels.set(new Uint8Array(80).fill(1));
  setGlyph(glyphSet, 65, a);
  setGlyph(glyphSet, 66, createGlyph({ width: 4, height: 16, name: 'B' }));

  const restored = loadGlyphProjectFromString(saveGlyphProjectToString(glyphSet));
  assert.deepStrictEqual(restored, glyphSet);
});

test('round-trips an icon GlyphSet with PUA codepoints', () => {
  const glyphSet = createGlyphSet({ kind: 'icons' });
  setGlyph(glyphSet, 0xe000, createGlyph({ width: 16, height: 16, name: 'star' }));

  const restored = deserializeGlyphSetProject(serializeGlyphSetProject(glyphSet));
  assert.deepStrictEqual(restored, glyphSet);
});

test('an empty GlyphSet (no glyphs) round-trips too', () => {
  const glyphSet = createGlyphSet({});
  const restored = deserializeGlyphSetProject(serializeGlyphSetProject(glyphSet));
  assert.deepStrictEqual(restored, glyphSet);
});

test('deserializeGlyphSetProject rejects a non-glyph document', () => {
  assert.throws(() => deserializeGlyphSetProject({ pixelyphVersion: 1, kind: 'draw', canvas: {} }), /expected kind 'glyph'/);
});
