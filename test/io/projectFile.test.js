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

test('a Grid\'s pixel data is base64-encoded, not a raw JSON array', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  const doc = serializeProject(canvas);
  const encoded = doc.canvas.layers[0].frames[0].grids[0].pixels;
  assert.equal(typeof encoded, 'string');
  assert.doesNotMatch(encoded, /^\[/);
});

test('a painted Grid round-trips through bit-packed pixels with a much shorter base64 string than unpacked would be', () => {
  const canvas = createCanvas({ width: 16, height: 16 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) paintCell(canvas, x, y, '#ff0000');
  const doc = serializeProject(canvas);
  const encoded = doc.canvas.layers[0].frames[0].grids[0].pixels;
  assert.ok(encoded.length < 100, `expected a bit-packed 16x16 grid's base64 length well under the unpacked 344 chars, got ${encoded.length}`);

  const restored = loadProjectFromString(saveProjectToString(canvas));
  assert.deepStrictEqual(restored, canvas);
});

function legacyBytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Bit-packs pixels the same way v2+ saves do (8 cells/byte), for hand-building a legacy v2 doc. */
function bitsToBase64V2(pixels) {
  const bytes = new Uint8Array(Math.ceil(pixels.length / 8));
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i]) bytes[i >> 3] |= 1 << (i & 7);
  }
  return legacyBytesToBase64(bytes);
}

test('deserializeProject migrates a pre-bit-packing (v1) Advanced-tier layer into one cropped Grid per non-empty frame', () => {
  // Hand-built v1 doc: dense per-frame pixel buffer, style/offset/width/
  // height on the Layer — the real pre-migration shape (see docs/data-model.md).
  const width = 4, height = 4;
  const framePixels = new Uint8Array(width * height);
  framePixels[1 * width + 1] = 1; // interior cell, off every edge
  const doc = {
    pixelyphVersion: 1,
    kind: 'draw',
    canvas: {
      id: 'canvas-legacy', width, height, tier: 'advanced',
      palette: ['#ff0000'], symmetryMode: 'none', referenceImage: null,
      activeLayerId: 'layer-legacy', frameCount: 1, activeFrame: 0, frameRate: 12,
      frameDurations: [83],
      layers: [
        {
          id: 'layer-legacy', name: 'Legacy', locked: false, opacity: 1,
          offset: { x: 2, y: 3 }, width, height,
          style: { fill: '#ff0000', effects: [] },
          frames: [{ pixels: legacyBytesToBase64(framePixels), visible: true }],
        },
      ],
    },
  };

  const restored = deserializeProject(doc);

  assert.equal(restored.layers.length, 1);
  const layer = restored.layers[0];
  assert.equal(layer.id, 'layer-legacy'); // advanced-tier saves migrate 1:1, id preserved
  assert.equal(layer.frames.length, 1);
  assert.equal(layer.frames[0].grids.length, 1);
  const grid = layer.frames[0].grids[0];
  assert.equal(grid.width, 1);
  assert.equal(grid.height, 1);
  // offsetX/Y = old layer offset (2,3) + the cropped cell's local position (1,1)
  assert.equal(grid.offsetX, 3);
  assert.equal(grid.offsetY, 4);
  assert.deepEqual(Array.from(grid.pixels), [1]);
  assert.equal(grid.style.fill, '#ff0000');
  assert.equal(grid.visible, true);
  assert.equal(grid.locked, false);
  assert.equal(restored.activeLayerId, 'layer-legacy'); // preserved for advanced-tier saves
});

test('deserializeProject collapses a Simple-tier v2 save\'s per-color auto-layers into one Layer with one Grid per color, per frame', () => {
  const width = 2, height = 1;
  const redPixels = new Uint8Array([1, 0]);
  const bluePixels = new Uint8Array([0, 1]);
  const doc = {
    pixelyphVersion: 2,
    kind: 'draw',
    canvas: {
      id: 'canvas-legacy', width, height, tier: 'simple',
      palette: ['#ff0000', '#0000ff'], symmetryMode: 'none', referenceImage: null,
      activeLayerId: 'layer-red', frameCount: 1, activeFrame: 0, frameRate: 12,
      frameDurations: [83],
      layers: [
        {
          id: 'layer-red', name: '#ff0000', locked: false, opacity: 1,
          offset: { x: 0, y: 0 }, width, height,
          style: { fill: '#ff0000', effects: [] },
          frames: [{ pixels: bitsToBase64V2(redPixels), visible: true }],
          autoManaged: true, autoColor: '#ff0000',
        },
        {
          id: 'layer-blue', name: '#0000ff', locked: false, opacity: 1,
          offset: { x: 0, y: 0 }, width, height,
          style: { fill: '#0000ff', effects: [] },
          frames: [{ pixels: bitsToBase64V2(bluePixels), visible: true }],
          autoManaged: true, autoColor: '#0000ff',
        },
      ],
    },
  };

  const restored = deserializeProject(doc);

  assert.equal(restored.layers.length, 1); // collapsed into a single Layer
  const layer = restored.layers[0];
  assert.equal(layer.frames[0].grids.length, 2); // one Grid per color present in this frame
  const colors = layer.frames[0].grids.map((g) => g.style.fill).sort();
  assert.deepEqual(colors, ['#0000ff', '#ff0000']);
  // the old per-auto-layer activeLayerId is meaningless post-collapse — repointed at the new single Layer
  assert.equal(restored.activeLayerId, layer.id);
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

test('deserializeProject defaults frameCount/activeFrame/frameRate/frameDurations for a pre-Phase-7 file that lacks them', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  const doc = serializeProject(canvas);
  delete doc.canvas.frameCount;
  delete doc.canvas.activeFrame;
  delete doc.canvas.frameRate;
  delete doc.canvas.frameDurations;
  const restored = deserializeProject(doc);
  assert.equal(restored.frameCount, 1);
  assert.equal(restored.activeFrame, 0);
  assert.equal(restored.frameRate, 12);
  assert.deepEqual(restored.frameDurations, [Math.round(1000 / 12)]);
});

test('deserializeProject derives a uniform frameDurations array from frameRate/frameCount for a file that has those but predates per-frame duration', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.frameCount = 3;
  canvas.frameRate = 24;
  const doc = serializeProject(canvas);
  delete doc.canvas.frameDurations;
  const restored = deserializeProject(doc);
  assert.deepEqual(restored.frameDurations, [Math.round(1000 / 24), Math.round(1000 / 24), Math.round(1000 / 24)]);
});

test('deserializeProject migrates a pre-Phase-9 bare-array palette into the { colors, fills, styles } shape', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  const doc = serializeProject(canvas);
  doc.canvas.palette = ['#ff0000', '#00ff00']; // pre-Phase-9 saves stored palette as a flat array
  const restored = deserializeProject(doc);
  assert.deepEqual(restored.palette, { colors: ['#ff0000', '#00ff00'], fills: [], styles: [] });
});

test('deserializeProject rejects a non-draw document', () => {
  assert.throws(() => deserializeProject({ pixelyphVersion: 1, kind: 'glyph', glyphSet: {} }), /expected kind 'draw'/);
});

test('round-trips an advanced-tier canvas with a gradient-filled, stroked, effect-bearing shape, and activeLayerId/activeGridId exactly', () => {
  const canvas = createCanvas({ width: 3, height: 3 });
  canvas.tier = 'advanced';
  const layer = addLayer(canvas, { name: 'styled' });
  paintCell(canvas, 0, 0, '#ff0000');
  const grid = layer.frames[0].grids[0];
  grid.style.fill = { type: 'linear-gradient', angle: 45, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  grid.style.stroke = { color: '#00ff00', width: 0.2, linecap: 'round', linejoin: 'round', dashArray: [0.5, 0.25] };
  grid.style.effects = [{ type: 'drop-shadow', dx: 0.2, dy: 0.2, blur: 0.1, color: '#000', opacity: 0.5 }];
  canvas.activeLayerId = layer.id;
  canvas.activeGridId = grid.id;

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
