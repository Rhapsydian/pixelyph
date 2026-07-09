import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketFillTool } from '../../../../src/ui/draw/tools/bucketFill.js';

// ctx is a plain object of getters/functions (see SvgPixelEditor.jsx's
// useMemo) — a minimal in-memory mock is enough to exercise bucketFillTool
// without touching the real store/React tree.
function makeCtx({ width, height, cells, fillGlobal = false, fillTolerance = 0, erasing = false }) {
  const grid = cells.map((row) => row.slice());
  return {
    canvasWidth: width,
    canvasHeight: height,
    fillGlobal,
    fillTolerance,
    erasing,
    activeColor: '#00ff00',
    colorAt: (x, y) => grid[y][x],
    paintCellLive: (x, y, color) => {
      grid[y][x] = color;
    },
    commitStroke: () => {},
    grid,
  };
}

test('bucketFill exact-match (tolerance 0) only fills the contiguous region', () => {
  const ctx = makeCtx({
    width: 3,
    height: 1,
    cells: [['#ff0000', '#ff0000', '#0000ff']],
  });
  bucketFillTool.onPointerDown(ctx, 0, 0);
  assert.deepEqual(ctx.grid, [['#00ff00', '#00ff00', '#0000ff']]);
});

test('bucketFill tolerance fills a near-but-not-exact color match', () => {
  const ctx = makeCtx({
    width: 2,
    height: 1,
    cells: [['#ff0000', '#fe0000']], // off by 1 in red channel
    fillTolerance: 5,
  });
  bucketFillTool.onPointerDown(ctx, 0, 0);
  assert.deepEqual(ctx.grid, [['#00ff00', '#00ff00']]);
});

test('bucketFill tolerance 0 does not fill a near-but-not-exact color', () => {
  const ctx = makeCtx({
    width: 2,
    height: 1,
    cells: [['#ff0000', '#fe0000']],
    fillTolerance: 0,
  });
  bucketFillTool.onPointerDown(ctx, 0, 0);
  assert.deepEqual(ctx.grid, [['#00ff00', '#fe0000']]);
});

test('bucketFill global mode fills matching cells across disconnected regions', () => {
  const ctx = makeCtx({
    width: 3,
    height: 1,
    cells: [['#ff0000', '#0000ff', '#ff0000']],
    fillGlobal: true,
  });
  bucketFillTool.onPointerDown(ctx, 0, 0);
  assert.deepEqual(ctx.grid, [['#00ff00', '#0000ff', '#00ff00']]);
});

test('bucketFill never matches a null (gradient/blank) cell against a non-null target, at any tolerance', () => {
  const ctx = makeCtx({
    width: 2,
    height: 1,
    cells: [['#ff0000', null]],
    fillTolerance: 255,
  });
  bucketFillTool.onPointerDown(ctx, 0, 0);
  assert.deepEqual(ctx.grid, [['#00ff00', null]]);
});
