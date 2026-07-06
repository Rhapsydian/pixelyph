import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, paintCell, colorAt, addFrame, setActiveFrame } from '../../src/model/Canvas.js';

function paintedColors(canvas) {
  return canvas.layers.filter((l) => l.autoManaged).map((l) => l.autoColor).sort();
}

test('painting a color creates an auto-managed full-canvas layer lazily', () => {
  const canvas = createCanvas({ width: 4, height: 4 });
  paintCell(canvas, 0, 0, '#ff0000');
  assert.equal(canvas.layers.length, 1);
  assert.equal(canvas.layers[0].autoColor, '#ff0000');
  assert.equal(canvas.layers[0].width, 4);
  assert.equal(canvas.layers[0].height, 4);
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
});

test('painting color B over a cell clears it from color A layer (mutual exclusivity)', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 0, '#ff0000');
  paintCell(canvas, 0, 0, '#00ff00');
  // (0,0) now belongs to green only; (1,0) is still red — never both at once.
  assert.equal(colorAt(canvas, 0, 0), '#00ff00');
  assert.equal(colorAt(canvas, 1, 0), '#ff0000');
  const redLayer = canvas.layers.find((l) => l.autoColor === '#ff0000');
  assert.equal(redLayer.frames[0].pixels[0], 0); // (0,0) cleared from red's grid
  assert.equal(redLayer.frames[0].pixels[1], 1); // (1,0) still set
});

test('a color layer is garbage-collected once its last cell is overwritten', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  assert.deepEqual(paintedColors(canvas), ['#ff0000']);
  paintCell(canvas, 0, 0, '#00ff00');
  assert.deepEqual(paintedColors(canvas), ['#00ff00']);
  assert.equal(canvas.simpleTier.colorToLayerId.has('#ff0000'), false);
});

test('a color layer survives if it still has other cells set', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 1, '#ff0000');
  paintCell(canvas, 0, 0, '#00ff00');
  assert.deepEqual(paintedColors(canvas), ['#00ff00', '#ff0000']);
  assert.equal(colorAt(canvas, 1, 1), '#ff0000');
});

test('multi-color strokes decompose the same way regardless of paint order', () => {
  const canvasA = createCanvas({ width: 3, height: 1 });
  paintCell(canvasA, 0, 0, '#ff0000');
  paintCell(canvasA, 1, 0, '#00ff00');
  paintCell(canvasA, 2, 0, '#0000ff');

  const canvasB = createCanvas({ width: 3, height: 1 });
  paintCell(canvasB, 2, 0, '#0000ff');
  paintCell(canvasB, 0, 0, '#ff0000');
  paintCell(canvasB, 1, 0, '#00ff00');

  for (let x = 0; x < 3; x++) {
    assert.equal(colorAt(canvasA, x, 0), colorAt(canvasB, x, 0));
  }
  assert.deepEqual(paintedColors(canvasA), paintedColors(canvasB));
});

test('erasing (null color) clears a cell without creating a layer', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 0, 0, null);
  assert.equal(colorAt(canvas, 0, 0), null);
  assert.equal(canvas.layers.length, 0);
});

test('simple-tier auto-layer paint targets the active frame only, and an auto layer created mid-animation gets every frame', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  addFrame(canvas); // frame 1, active
  paintCell(canvas, 0, 0, '#ff0000');
  const layer = canvas.layers.find((l) => l.autoColor === '#ff0000');
  assert.equal(layer.frames.length, 2); // matches canvas.frameCount even though it didn't exist at frame 0
  assert.equal(layer.frames[1].pixels[0], 1);
  assert.equal(layer.frames[0].pixels[0], 0);
});

test('auto-layer GC only collects a layer once every frame is empty, not just the active one', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000'); // frame 0
  addFrame(canvas); // frame 1, active
  paintCell(canvas, 1, 1, '#ff0000'); // frame 1

  setActiveFrame(canvas, 0);
  paintCell(canvas, 0, 0, null); // clear frame 0's only red cell
  // frame 1 still has a red cell, so the layer must survive
  assert.equal(canvas.layers.some((l) => l.autoColor === '#ff0000'), true);

  setActiveFrame(canvas, 1);
  paintCell(canvas, 1, 1, null); // clear frame 1's only red cell too
  assert.equal(canvas.layers.some((l) => l.autoColor === '#ff0000'), false);
});
