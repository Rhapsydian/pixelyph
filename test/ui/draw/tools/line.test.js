import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLineCells, pixelPerfectFilter } from '../../../../src/ui/draw/tools/line.js';

test('computeLineCells draws a horizontal line', () => {
  assert.deepEqual(
    computeLineCells(0, 0, 3, 0),
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ],
  );
});

test('computeLineCells draws a perfect diagonal with no corners', () => {
  assert.deepEqual(
    computeLineCells(0, 0, 2, 2),
    [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ],
  );
});

test('computeLineCells collapses to a single cell for identical endpoints', () => {
  assert.deepEqual(computeLineCells(4, 4, 4, 4), [{ x: 4, y: 4 }]);
});

test('pixelPerfectFilter leaves an already-diagonal path untouched', () => {
  const cells = computeLineCells(0, 0, 3, 3);
  assert.deepEqual(pixelPerfectFilter(cells), cells);
});

test('pixelPerfectFilter drops a known 3-cell L corner', () => {
  const withCorner = [
    { x: 0, y: 0 },
    { x: 1, y: 0 }, // corner: shares y with prev, next is diagonally adjacent to prev
    { x: 1, y: 1 },
  ];
  assert.deepEqual(pixelPerfectFilter(withCorner), [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ]);
});

test('pixelPerfectFilter leaves a shallow-slope staircase (no true corner) untouched', () => {
  // Bresenham for a shallow slope legitimately repeats an axis step twice
  // between diagonal steps — not the single-pixel bump pixel-perfect targets.
  const cells = computeLineCells(0, 0, 4, 1);
  assert.deepEqual(pixelPerfectFilter(cells), cells);
});

test('pixelPerfectFilter is a no-op for paths shorter than 3 cells', () => {
  const cells = computeLineCells(0, 0, 1, 0);
  assert.deepEqual(pixelPerfectFilter(cells), cells);
});
