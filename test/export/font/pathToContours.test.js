import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToContours } from '../../../src/export/font/pathToContours.js';

test('pathToContours parses the pixelloom README example into outer + hole contours', () => {
  const contours = pathToContours('M0 0H3V3H0ZM2 1H1V2H2Z');
  assert.deepEqual(contours, [
    [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }],
    [{ x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
  ]);
});

test('pathToContours handles relative h/v commands', () => {
  const contours = pathToContours('M1 1h2v2h-2Z');
  assert.deepEqual(contours, [[{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }]]);
});

test('pathToContours on an empty path returns no contours', () => {
  assert.deepEqual(pathToContours(''), []);
});

test('pathToContours handles a single unclosed subpath with no Z', () => {
  const contours = pathToContours('M0 0H1V1H0');
  assert.deepEqual(contours, [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]]);
});
