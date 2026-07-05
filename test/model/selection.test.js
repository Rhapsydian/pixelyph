import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, paintCell, colorAt } from '../../src/model/Canvas.js';
import { normalizeRect, extractRectColors, clearRect, pasteCells } from '../../src/model/selection.js';

test('normalizeRect handles corners given in any order', () => {
  assert.deepEqual(normalizeRect(3, 3, 0, 0), { x0: 0, y0: 0, x1: 3, y1: 3 });
  assert.deepEqual(normalizeRect(0, 3, 3, 0), { x0: 0, y0: 0, x1: 3, y1: 3 });
});

test('a move spanning two colors relocates both layers correctly (selection/paste across multiple auto-managed layers)', () => {
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

  // both source colors' auto layers still exist (now relocated), nothing left behind
  const colorsPresent = canvas.layers.filter((l) => l.autoManaged).map((l) => l.autoColor).sort();
  assert.deepEqual(colorsPresent, ['#00ff00', '#ff0000']);
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
