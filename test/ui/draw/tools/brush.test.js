import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brushCells, ditherCells, isPixelPerfectCorner } from '../../../../src/ui/draw/tools/brush.js';

test('brushCells returns a single cell at width 1 (default, unchanged behavior)', () => {
  assert.deepEqual(brushCells(5, 5, 1), [{ x: 5, y: 5 }]);
});

test('brushCells returns a 2x2 stamp at width 2, top-left biased', () => {
  const cells = brushCells(5, 5, 2);
  assert.deepEqual(
    cells,
    [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ],
  );
});

test('brushCells returns a centered 3x3 stamp at width 3', () => {
  const cells = brushCells(5, 5, 3);
  assert.equal(cells.length, 9);
  assert.deepEqual(cells[0], { x: 4, y: 4 });
  assert.deepEqual(cells[cells.length - 1], { x: 6, y: 6 });
});

test('ditherCells keeps only the checkerboard-parity subset', () => {
  const stamp = brushCells(0, 0, 2); // {0,0},{1,0},{0,1},{1,1}
  assert.deepEqual(ditherCells(stamp), [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
});

test('isPixelPerfectCorner detects the classic single-pixel L bump', () => {
  assert.equal(isPixelPerfectCorner({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }), true);
  assert.equal(isPixelPerfectCorner({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }), true);
});

test('isPixelPerfectCorner is false for a shallow-slope staircase step', () => {
  // prev -> next two cells apart on x, one on y: not diagonally adjacent, no corner.
  assert.equal(isPixelPerfectCorner({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }), false);
});

test('isPixelPerfectCorner is false when next is not diagonally adjacent to prev at all', () => {
  assert.equal(isPixelPerfectCorner({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 3 }), false);
});
