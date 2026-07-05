import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, paintCell, resizeCanvas, colorAt } from '../../src/model/Canvas.js';

test('colorAt reads the topmost (last) visible layer that owns a cell', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 1, '#00ff00');
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(colorAt(canvas, 1, 1), '#00ff00');
  assert.equal(colorAt(canvas, 1, 0), null);
});

test('resizeCanvas grows a full-canvas layer with the new dimensions, content preserved relative to anchor', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 1, '#ff0000');
  resizeCanvas(canvas, 4, 4, 'top-left');
  assert.equal(canvas.width, 4);
  assert.equal(canvas.height, 4);
  const layer = canvas.layers[0];
  assert.equal(layer.width, 4);
  assert.equal(layer.height, 4);
  assert.deepEqual(layer.offset, { x: 0, y: 0 });
  assert.equal(colorAt(canvas, 0, 0), '#ff0000');
  assert.equal(colorAt(canvas, 1, 1), '#ff0000');
  assert.equal(colorAt(canvas, 3, 3), null);
});

test('resizeCanvas shrinking crops content relative to anchor', () => {
  const canvas = createCanvas({ width: 4, height: 4 });
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 3, 3, '#00ff00');
  resizeCanvas(canvas, 2, 2, 'bottom-right');
  assert.equal(canvas.width, 2);
  assert.equal(canvas.height, 2);
  // top-left content (0,0) is cropped away; bottom-right content (3,3) lands at the new (1,1)
  assert.equal(colorAt(canvas, 0, 0), null);
  assert.equal(colorAt(canvas, 1, 1), '#00ff00');
});

test('resizeCanvas center anchor keeps content centered after growth', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  resizeCanvas(canvas, 3, 3, 'center');
  assert.equal(colorAt(canvas, 1, 1), '#ff0000');
  assert.equal(colorAt(canvas, 0, 0), null);
});
