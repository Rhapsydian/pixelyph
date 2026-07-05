import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGrid } from '../../src/model/Grid.js';
import { rasterizeRect, rasterizeEllipse } from '../../src/model/shapeRasterize.js';

function rows(grid) {
  const out = [];
  for (let y = 0; y < grid.height; y++) out.push(Array.from(grid.pixels.slice(y * grid.width, y * grid.width + grid.width)));
  return out;
}

test('rasterizeRect filled fills the whole bounding box', () => {
  const grid = createGrid(4, 4);
  rasterizeRect(grid, 1, 1, 2, 2, { filled: true });
  assert.deepEqual(rows(grid), [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ]);
});

test('rasterizeRect outline draws only the border', () => {
  const grid = createGrid(4, 4);
  rasterizeRect(grid, 0, 0, 3, 3, { filled: false });
  assert.deepEqual(rows(grid), [
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
  ]);
});

test('rasterizeRect normalizes reversed corners', () => {
  const gridA = createGrid(3, 3);
  rasterizeRect(gridA, 2, 2, 0, 0, { filled: true });
  const gridB = createGrid(3, 3);
  rasterizeRect(gridB, 0, 0, 2, 2, { filled: true });
  assert.deepEqual(rows(gridA), rows(gridB));
});

test('rasterizeEllipse filled circle has no holes and is roughly symmetric', () => {
  const grid = createGrid(9, 9);
  rasterizeEllipse(grid, 4, 4, 4, 4, { filled: true });
  // every row within the circle's vertical extent has at least one on pixel, and the shape is left-right symmetric
  for (let y = 0; y < 9; y++) {
    const row = grid.pixels.slice(y * 9, y * 9 + 9);
    const on = Array.from(row).some(Boolean);
    if (y === 0 || y === 8) continue; // extreme rows may be a thin cap
    assert.ok(on, `row ${y} should have on pixels`);
  }
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      assert.equal(grid.pixels[y * 9 + x], grid.pixels[y * 9 + (8 - x)], `row ${y} should be left-right symmetric`);
    }
  }
});

test('rasterizeEllipse outline is a subset of the filled version', () => {
  const filled = createGrid(9, 9);
  rasterizeEllipse(filled, 4, 4, 4, 4, { filled: true });
  const outline = createGrid(9, 9);
  rasterizeEllipse(outline, 4, 4, 4, 4, { filled: false });
  for (let i = 0; i < filled.pixels.length; i++) {
    if (outline.pixels[i]) assert.equal(filled.pixels[i], 1, `outline pixel ${i} should also be filled`);
  }
  const outlineCount = outline.pixels.reduce((a, b) => a + b, 0);
  const filledCount = filled.pixels.reduce((a, b) => a + b, 0);
  assert.ok(outlineCount < filledCount, 'outline should have fewer on pixels than filled');
});

test('rasterizeEllipse with zero radius plots a single pixel', () => {
  const grid = createGrid(3, 3);
  rasterizeEllipse(grid, 1, 1, 0, 0, { filled: false });
  assert.deepEqual(rows(grid), [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ]);
});

/** @returns {boolean} whether every 'on' pixel in `grid` is reachable from the first one via 8-connected neighbors — i.e. the outline is one unbroken loop, not scattered points with gaps. */
function isFullyConnected(grid) {
  const on = [];
  for (let i = 0; i < grid.pixels.length; i++) if (grid.pixels[i]) on.push(i);
  if (on.length === 0) return true;
  const visited = new Set([on[0]]);
  const stack = [on[0]];
  while (stack.length > 0) {
    const idx = stack.pop();
    const x = idx % grid.width;
    const y = Math.floor(idx / grid.width);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
        const nIdx = ny * grid.width + nx;
        if (grid.pixels[nIdx] && !visited.has(nIdx)) {
          visited.add(nIdx);
          stack.push(nIdx);
        }
      }
    }
  }
  return visited.size === on.length;
}

test('rasterizeEllipse outline has no gaps for a wide, flat ellipse (regression: per-row min/max used to drop the flat cap)', () => {
  const grid = createGrid(21, 11);
  rasterizeEllipse(grid, 10, 5, 9, 4, { filled: false });
  assert.ok(isFullyConnected(grid), 'outline should be one unbroken 8-connected loop');
});

test('rasterizeEllipse outline has no gaps for a tall, narrow ellipse', () => {
  const grid = createGrid(11, 21);
  rasterizeEllipse(grid, 5, 10, 3, 9, { filled: false });
  assert.ok(isFullyConnected(grid), 'outline should be one unbroken 8-connected loop');
});

test('rasterizeEllipse outline has no gaps for a circle', () => {
  const grid = createGrid(15, 15);
  rasterizeEllipse(grid, 7, 7, 6, 6, { filled: false });
  assert.ok(isFullyConnected(grid), 'outline should be one unbroken 8-connected loop');
});
