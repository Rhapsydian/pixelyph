import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, paintCell, resizeCanvas } from '../../src/model/Canvas.js';
import { serializeProject, deserializeProject, saveProjectToString, loadProjectFromString, PIXELYPH_VERSION } from '../../src/io/projectFile.js';

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
