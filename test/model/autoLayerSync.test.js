import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, paintCell, colorAt, addFrame, setActiveFrame } from '../../src/model/Canvas.js';

// Session 4: these all depend on the pre-migration per-color auto-managed
// Layer (`layer.autoManaged`/`layer.autoColor`, one full-canvas Layer per
// color, GC'd only once every frame is empty). Simple tier is now a single
// Layer whose current-frame Grids are scanned/created by style instead (see
// BACKLOG.md's Layer/Frame/Grid redesign entry) — equivalent coverage is
// added below against the new shape.

test.skip('painting a color creates an auto-managed full-canvas layer lazily', () => {});
test.skip('painting color B over a cell clears it from color A layer (mutual exclusivity)', () => {});
test.skip('a color layer is garbage-collected once its last cell is overwritten', () => {});
test.skip('a color layer survives if it still has other cells set', () => {});
test.skip('multi-color strokes decompose the same way regardless of paint order', () => {});
test.skip('erasing (null color) clears a cell without creating a layer', () => {});
test.skip('simple-tier auto-layer paint targets the active frame only, and an auto layer created mid-animation gets every frame', () => {});
test.skip('auto-layer GC only collects a layer once every frame is empty, not just the active one', () => {});

function shapeColors(canvas) {
  const layer = canvas.layers[0];
  const frame = layer.frames[canvas.activeFrame ?? 0];
  return frame.grids.map((g) => g.style.fill).sort();
}

test('painting a color creates the single simple-tier layer lazily, with one Grid for that color', () => {
  const canvas = createCanvas({ width: 4, height: 4 });
  paintCell(canvas, 0, 0, '#ff0000');
  assert.equal(canvas.layers.length, 1);
  assert.deepEqual(shapeColors(canvas), ['#ff0000']);
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
});

test('painting color B over a cell clears it from color A\'s shape (mutual exclusivity)', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 0, '#ff0000');
  paintCell(canvas, 0, 0, '#00ff00');
  // (0,0) now belongs to green only; (1,0) is still red — never both at once.
  assert.equal(colorAt(canvas, 0, 0), '#00ff00');
  assert.equal(colorAt(canvas, 1, 0), '#ff0000');
});

test('a color\'s shape is garbage-collected once its last cell is overwritten', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  assert.deepEqual(shapeColors(canvas), ['#ff0000']);
  paintCell(canvas, 0, 0, '#00ff00');
  assert.deepEqual(shapeColors(canvas), ['#00ff00']);
});

test('a color\'s shape survives if it still has other cells set', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 1, '#ff0000');
  paintCell(canvas, 0, 0, '#00ff00');
  assert.deepEqual(shapeColors(canvas), ['#00ff00', '#ff0000']);
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
  assert.deepEqual(shapeColors(canvasA), shapeColors(canvasB));
});

test('erasing (null color) clears a cell without creating a layer', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 0, 0, null);
  assert.equal(colorAt(canvas, 0, 0), null);
  assert.equal(canvas.layers[0].frames[0].grids.length, 0);
});

test('simple-tier paint targets the active frame\'s own Grids only, and a color painted mid-animation only creates a shape in that frame', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  addFrame(canvas); // frame 1, active
  paintCell(canvas, 0, 0, '#ff0000');
  const layer = canvas.layers[0];
  assert.equal(layer.frames.length, 2); // the layer itself always matches canvas.frameCount
  assert.equal(layer.frames[1].grids.length, 1); // this frame has the new shape
  assert.equal(layer.frames[0].grids.length, 0); // frame 0 is untouched — no shape created there
});

test('each frame\'s shapes are garbage-collected independently — clearing one frame\'s cell never affects another frame\'s own shape', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000'); // frame 0
  addFrame(canvas); // frame 1, active
  paintCell(canvas, 1, 1, '#ff0000'); // frame 1 — an independent Grid from frame 0's

  setActiveFrame(canvas, 0);
  paintCell(canvas, 0, 0, null); // clear frame 0's only red cell
  assert.equal(canvas.layers[0].frames[0].grids.length, 0);

  setActiveFrame(canvas, 1);
  assert.equal(canvas.layers[0].frames[1].grids.length, 1); // frame 1's shape is untouched
  assert.equal(colorAt(canvas, 1, 1), '#ff0000');
});
