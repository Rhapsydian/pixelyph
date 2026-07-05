import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mirrorPoints } from '../../src/model/mirror.js';

test('mode none returns only the original point', () => {
  assert.deepEqual(mirrorPoints(10, 10, 2, 3, 'none'), [{ x: 2, y: 3 }]);
});

test('mode x mirrors across the vertical center line (even width)', () => {
  const points = mirrorPoints(10, 6, 2, 3, 'x');
  assert.deepEqual(points, [
    { x: 2, y: 3 },
    { x: 7, y: 3 },
  ]);
});

test('mode y mirrors across the horizontal center line (even height)', () => {
  const points = mirrorPoints(6, 10, 2, 3, 'y');
  assert.deepEqual(points, [
    { x: 2, y: 3 },
    { x: 2, y: 6 },
  ]);
});

test('mode both mirrors across both axes', () => {
  const points = mirrorPoints(10, 8, 2, 3, 'both');
  assert.deepEqual(points, [
    { x: 2, y: 3 },
    { x: 7, y: 3 },
    { x: 2, y: 4 },
    { x: 7, y: 4 },
  ]);
});

test('a cell on the center column of an odd-width canvas dedupes to one point', () => {
  const points = mirrorPoints(7, 7, 3, 2, 'x'); // width 7: mirrorX of x=3 is 7-1-3=3, same cell
  assert.deepEqual(points, [{ x: 3, y: 2 }]);
});

test('mode both dedupes correctly on an odd x odd canvas at dead center', () => {
  const points = mirrorPoints(5, 5, 2, 2, 'both'); // center cell mirrors to itself on every axis
  assert.deepEqual(points, [{ x: 2, y: 2 }]);
});

test('even-dimension mirroring has no exact center cell (all four mirrored points distinct)', () => {
  const points = mirrorPoints(4, 4, 0, 0, 'both');
  assert.deepEqual(points, [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 0, y: 3 },
    { x: 3, y: 3 },
  ]);
});
