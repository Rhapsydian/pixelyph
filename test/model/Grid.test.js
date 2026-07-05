import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGrid, get, set, resize, clone } from '../../src/model/Grid.js';

function fill(grid, values) {
  grid.pixels.set(values);
  return grid;
}

function toRows(grid) {
  const rows = [];
  for (let y = 0; y < grid.height; y++) {
    rows.push(Array.from(grid.pixels.slice(y * grid.width, y * grid.width + grid.width)));
  }
  return rows;
}

test('get/set read and write in-bounds cells', () => {
  const grid = createGrid(3, 2);
  set(grid, 1, 1, 1);
  assert.equal(get(grid, 1, 1), 1);
  assert.equal(get(grid, 0, 0), 0);
});

test('get is 0 for out-of-bounds reads rather than throwing', () => {
  const grid = createGrid(2, 2);
  assert.equal(get(grid, -1, 0), 0);
  assert.equal(get(grid, 0, -1), 0);
  assert.equal(get(grid, 2, 0), 0);
  assert.equal(get(grid, 0, 2), 0);
});

test('set is a no-op for out-of-bounds writes', () => {
  const grid = createGrid(2, 2);
  set(grid, -1, 0, 1);
  set(grid, 5, 5, 1);
  assert.deepEqual(Array.from(grid.pixels), [0, 0, 0, 0]);
});

test('clone produces an independent copy', () => {
  const grid = fill(createGrid(2, 2), [1, 0, 0, 1]);
  const copy = clone(grid);
  set(copy, 0, 0, 0);
  assert.equal(get(grid, 0, 0), 1);
  assert.equal(get(copy, 0, 0), 0);
});

test('resize top-left anchor pads growth to the right and bottom', () => {
  // prettier-ignore
  const grid = fill(createGrid(2, 2), [
    1, 2,
    3, 4,
  ]);
  const resized = resize(grid, 3, 3, 'top-left');
  assert.deepEqual(toRows(resized), [
    [1, 2, 0],
    [3, 4, 0],
    [0, 0, 0],
  ]);
});

test('resize bottom-right anchor pads growth to the left and top', () => {
  // prettier-ignore
  const grid = fill(createGrid(2, 2), [
    1, 2,
    3, 4,
  ]);
  const resized = resize(grid, 3, 3, 'bottom-right');
  assert.deepEqual(toRows(resized), [
    [0, 0, 0],
    [0, 1, 2],
    [0, 3, 4],
  ]);
});

test('resize center anchor pads growth symmetrically (odd delta rounds toward top-left)', () => {
  const grid = fill(createGrid(1, 1), [1]);
  const resized = resize(grid, 3, 3, 'center');
  assert.deepEqual(toRows(resized), [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ]);
});

test('resize top-left anchor crops content from the right and bottom when shrinking', () => {
  // prettier-ignore
  const grid = fill(createGrid(3, 3), [
    1, 2, 3,
    4, 5, 6,
    7, 8, 9,
  ]);
  const resized = resize(grid, 2, 2, 'top-left');
  assert.deepEqual(toRows(resized), [
    [1, 2],
    [4, 5],
  ]);
});

test('resize bottom-right anchor crops content from the left and top when shrinking', () => {
  // prettier-ignore
  const grid = fill(createGrid(3, 3), [
    1, 2, 3,
    4, 5, 6,
    7, 8, 9,
  ]);
  const resized = resize(grid, 2, 2, 'bottom-right');
  assert.deepEqual(toRows(resized), [
    [5, 6],
    [8, 9],
  ]);
});
