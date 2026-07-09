import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, paintCell, colorAt, addLayer, addGrid } from '../../src/model/Canvas.js';
import { normalizeRect, extractRectColors, extractRectFromActiveLayer, extractRectFromActiveGrid, clearRect, clearRectAllLayers, pasteCells } from '../../src/model/selection.js';

test('normalizeRect handles corners given in any order', () => {
  assert.deepEqual(normalizeRect(3, 3, 0, 0), { x0: 0, y0: 0, x1: 3, y1: 3 });
  assert.deepEqual(normalizeRect(0, 3, 3, 0), { x0: 0, y0: 0, x1: 3, y1: 3 });
});

test('a move spanning two colors relocates both shapes correctly (selection/paste across multiple simple-tier Grids)', () => {
  const canvas = createCanvas({ width: 4, height: 4 });
  // a 2x1 selection covering one red cell and one green cell
  paintCell(canvas, 0, 0, '#ff0000');
  paintCell(canvas, 1, 0, '#00ff00');

  const rect = normalizeRect(0, 0, 1, 0);
  const cells = extractRectColors(canvas, rect);
  assert.deepEqual(
    cells.slice().sort((a, b) => a.dx - b.dx),
    [
      { dx: 0, dy: 0, color: '#ff0000' },
      { dx: 1, dy: 0, color: '#00ff00' },
    ],
  );

  clearRect(canvas, rect);
  assert.equal(colorAt(canvas, 0, 0), null);
  assert.equal(colorAt(canvas, 1, 0), null);

  // move it down-right by (2, 2)
  pasteCells(canvas, 2, 2, cells);
  assert.equal(colorAt(canvas, 2, 2), '#ff0000');
  assert.equal(colorAt(canvas, 3, 2), '#00ff00');

  // both source colors' shapes still exist (now relocated), nothing left behind
  const shapeColors = canvas.layers[0].frames[0].grids.map((g) => g.style.fill).sort();
  assert.deepEqual(shapeColors, ['#00ff00', '#ff0000']);
});

test('a non-destructive copy leaves the source untouched', () => {
  const canvas = createCanvas({ width: 4, height: 4 });
  paintCell(canvas, 0, 0, '#ff0000');
  const rect = normalizeRect(0, 0, 0, 0);
  const cells = extractRectColors(canvas, rect);
  pasteCells(canvas, 2, 2, cells);
  assert.equal(colorAt(canvas, 0, 0), '#ff0000'); // still there
  assert.equal(colorAt(canvas, 2, 2), '#ff0000'); // duplicated
});

test('extractRectColors omits empty cells rather than recording them as null', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  paintCell(canvas, 0, 0, '#ff0000');
  const cells = extractRectColors(canvas, { x0: 0, y0: 0, x1: 1, y1: 0 });
  assert.deepEqual(cells, [{ dx: 0, dy: 0, color: '#ff0000' }]);
});

// --- Advanced tier: per-layer selection scoping ---

test('extractRectFromActiveLayer only reads the active layer\'s own shapes, ignoring a non-active layer stacked on top of it', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  const bottom = addLayer(canvas, { name: 'bottom' });
  canvas.activeLayerId = bottom.id;
  paintCell(canvas, 0, 0, '#0000ff');
  addLayer(canvas, { name: 'top' }); // becomes active, covers (1,0)
  paintCell(canvas, 1, 0, '#ff0000');
  canvas.activeLayerId = bottom.id; // scope back to the bottom layer

  const cells = extractRectFromActiveLayer(canvas, { x0: 0, y0: 0, x1: 1, y1: 0 });
  assert.deepEqual(cells, [{ dx: 0, dy: 0, color: '#0000ff' }]); // only the active (bottom) layer's own cell
});

test('extractRectFromActiveLayer falls back to a placeholder color for a non-solid (gradient) fill', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'grad' });
  paintCell(canvas, 0, 0, '#ffffff');
  const grid = canvas.layers[0].frames[0].grids[0];
  grid.style.fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  const cells = extractRectFromActiveLayer(canvas, { x0: 0, y0: 0, x1: 0, y1: 0 });
  assert.equal(cells.length, 1);
  assert.equal(typeof cells[0].color, 'string');
});

test('extractRectFromActiveLayer returns nothing when there is no active layer', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  assert.deepEqual(extractRectFromActiveLayer(canvas, { x0: 0, y0: 0, x1: 1, y1: 1 }), []);
});

test('extractRectFromActiveGrid only reads the active shape\'s own cells, ignoring a different shape in the same layer', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'layer' });
  paintCell(canvas, 0, 0, '#0000ff'); // shape A, becomes active
  const shapeAId = canvas.activeGridId;
  canvas.activeGridId = null; // deselect so the next paint starts a separate shape
  paintCell(canvas, 1, 0, '#ff0000'); // shape B, becomes active, covers (1,0)
  canvas.activeGridId = shapeAId; // re-select shape A explicitly (ShapeRow click)

  const cells = extractRectFromActiveGrid(canvas, { x0: 0, y0: 0, x1: 1, y1: 0 });
  assert.deepEqual(cells, [{ dx: 0, dy: 0, color: '#0000ff' }]); // only shape A's own cell
});

test('extractRectFromActiveGrid falls back to a placeholder color for a non-solid (gradient) fill', () => {
  const canvas = createCanvas({ width: 1, height: 1 });
  canvas.tier = 'advanced';
  addLayer(canvas, { name: 'grad' });
  paintCell(canvas, 0, 0, '#ffffff');
  canvas.layers[0].frames[0].grids[0].style.fill = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
  const cells = extractRectFromActiveGrid(canvas, { x0: 0, y0: 0, x1: 0, y1: 0 });
  assert.equal(cells.length, 1);
  assert.equal(typeof cells[0].color, 'string');
});

test('extractRectFromActiveGrid returns nothing when there is no active shape', () => {
  const canvas = createCanvas({ width: 2, height: 2 });
  canvas.tier = 'advanced';
  addLayer(canvas);
  canvas.activeGridId = null;
  assert.deepEqual(extractRectFromActiveGrid(canvas, { x0: 0, y0: 0, x1: 1, y1: 1 }), []);
});

test('clearRectAllLayers clears each cell from whichever layer actually owns it, not just the active layer', () => {
  const canvas = createCanvas({ width: 2, height: 1 });
  canvas.tier = 'advanced';
  const bottom = addLayer(canvas, { name: 'bottom' });
  canvas.activeLayerId = bottom.id;
  paintCell(canvas, 0, 0, 'x');
  const top = addLayer(canvas, { name: 'top' }); // becomes active
  paintCell(canvas, 1, 0, 'x');
  canvas.activeLayerId = top.id; // active layer only covers (1,0); (0,0) belongs to `bottom`

  clearRectAllLayers(canvas, { x0: 0, y0: 0, x1: 1, y1: 0 });
  assert.equal(colorAt(canvas, 0, 0), null); // bottom's cell cleared too, despite not being active
  assert.equal(colorAt(canvas, 1, 0), null);
});
