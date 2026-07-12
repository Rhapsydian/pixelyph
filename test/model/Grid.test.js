import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrid,
  get,
  set,
  resize,
  clone,
  createShapeGrid,
  growGridToInclude,
  minimalBounds,
  shrinkGridToFit,
  mergeGridDown,
  stylesEqual,
  flipPixelsH,
  flipPixelsV,
  rotatePixels90,
  flipGridH,
  flipGridV,
  rotateGrid90,
  transformGridRegion,
} from '../../src/model/Grid.js';

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

// --- Session 1: Shape (Grid) — see docs/data-model.md ---

test('createShapeGrid builds a 1x1 shape at the given offset, with the given style', () => {
  const style = { fill: '#ff0000', effects: [] };
  const grid = createShapeGrid({ name: 'Shape 1', offsetX: 3, offsetY: 4, style });
  assert.equal(grid.name, 'Shape 1');
  assert.equal(grid.offsetX, 3);
  assert.equal(grid.offsetY, 4);
  assert.equal(grid.width, 1);
  assert.equal(grid.height, 1);
  assert.deepEqual(Array.from(grid.pixels), [1]);
  assert.equal(grid.style, style);
  assert.equal(grid.visible, true);
  assert.equal(grid.locked, false);
  assert.equal(grid.opacity, 1);
});

test('createShapeGrid mints a fresh id each call', () => {
  const style = { fill: '#000', effects: [] };
  const a = createShapeGrid({ offsetX: 0, offsetY: 0, style });
  const b = createShapeGrid({ offsetX: 0, offsetY: 0, style });
  assert.notEqual(a.id, b.id);
});

test('growGridToInclude is a no-op when the point is already inside bounds', () => {
  const grid = createShapeGrid({ offsetX: 1, offsetY: 1, style: { fill: '#000', effects: [] } });
  growGridToInclude(grid, 1, 1);
  assert.equal(grid.width, 1);
  assert.equal(grid.height, 1);
  assert.equal(grid.offsetX, 1);
  assert.equal(grid.offsetY, 1);
});

test('growGridToInclude grows towards positive x/y, preserving content and offset', () => {
  const grid = createShapeGrid({ offsetX: 0, offsetY: 0, style: { fill: '#000', effects: [] } });
  growGridToInclude(grid, 2, 1);
  assert.equal(grid.width, 3);
  assert.equal(grid.height, 2);
  assert.equal(grid.offsetX, 0);
  assert.equal(grid.offsetY, 0);
  assert.equal(get(grid, 0, 0), 1);
});

test('growGridToInclude grows towards negative x/y, shifting offset and preserving content at its new local position', () => {
  const grid = createShapeGrid({ offsetX: 3, offsetY: 3, style: { fill: '#000', effects: [] } }); // canvas-space (3,3)
  growGridToInclude(grid, 1, 1);
  assert.deepEqual({ x: grid.offsetX, y: grid.offsetY }, { x: 1, y: 1 });
  assert.equal(grid.width, 3);
  assert.equal(grid.height, 3);
  assert.equal(get(grid, 2, 2), 1); // original cell, now at local (2,2) relative to the new offset
  assert.equal(get(grid, 0, 0), 0);
});

test('growGridToInclude growing in only one negative direction leaves the other axis untouched', () => {
  const grid = createShapeGrid({ offsetX: 3, offsetY: 3, style: { fill: '#000', effects: [] } });
  growGridToInclude(grid, 1, 3); // only x moves negative; y stays inside bounds
  assert.equal(grid.offsetX, 1);
  assert.equal(grid.offsetY, 3);
  assert.equal(grid.width, 3);
  assert.equal(grid.height, 1);
  assert.equal(get(grid, 2, 0), 1); // original cell, now at local (2,0) relative to the new offset
});

test('growGridToInclude on an unfilled shape leaves it empty — resizing the buffer never sets a pixel', () => {
  const grid = createShapeGrid({ offsetX: 0, offsetY: 0, style: { fill: '#000', effects: [] }, filled: false });
  growGridToInclude(grid, 2, 2);
  assert.equal(grid.width, 3);
  assert.equal(grid.height, 3);
  assert.equal(minimalBounds(grid), null);
});

test('minimalBounds returns null for a fully-empty grid, and the tight box otherwise', () => {
  assert.equal(minimalBounds(createGrid(3, 3)), null);
  // prettier-ignore
  const grid = fill(createGrid(4, 4), [
    0, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 0,
  ]);
  assert.deepEqual(minimalBounds(grid), { minX: 1, minY: 1, maxX: 2, maxY: 2 });
});

test('shrinkGridToFit crops a Grid down to its own minimal bounding box, adjusting its offset to compensate', () => {
  const grid = createShapeGrid({ offsetX: 0, offsetY: 0, style: { fill: '#000', effects: [] } });
  growGridToInclude(grid, 3, 3); // now 4x4, only (0,0) set
  const shrunk = shrinkGridToFit(grid);
  assert.equal(shrunk, grid);
  assert.equal(grid.width, 1);
  assert.equal(grid.height, 1);
  assert.equal(grid.offsetX, 0);
  assert.equal(grid.offsetY, 0);
  assert.deepEqual(Array.from(grid.pixels), [1]);
});

test('shrinkGridToFit returns null when every cell has been cleared — the caller\'s cue to delete the shape', () => {
  const grid = createShapeGrid({ offsetX: 5, offsetY: 5, style: { fill: '#000', effects: [] } });
  set(grid, 0, 0, 0);
  assert.equal(shrinkGridToFit(grid), null);
});

test('mergeGridDown ORs two shapes\' pixels into a combined bounding box, keeping the bottom shape\'s id/name/style ("bottom wins")', () => {
  const bottom = createShapeGrid({ name: 'Bottom', offsetX: 0, offsetY: 0, style: { fill: '#0000ff', effects: [] } });
  const top = createShapeGrid({ name: 'Top', offsetX: 3, offsetY: 3, style: { fill: '#ff0000', effects: [] } });
  const frame = { grids: [bottom, top] };

  mergeGridDown(frame, top.id);

  assert.equal(frame.grids.length, 1);
  const merged = frame.grids[0];
  assert.equal(merged, bottom);
  assert.equal(merged.name, 'Bottom');
  assert.equal(merged.style.fill, '#0000ff');
  assert.equal(merged.offsetX, 0);
  assert.equal(merged.offsetY, 0);
  assert.equal(merged.width, 4);
  assert.equal(merged.height, 4);
  assert.equal(get(merged, 0, 0), 1);
  assert.equal(get(merged, 3, 3), 1);
});

test('mergeGridDown no-ops when the shape is already at the bottom of the frame\'s grid list', () => {
  const only = createShapeGrid({ offsetX: 0, offsetY: 0, style: { fill: '#000', effects: [] } });
  const frame = { grids: [only] };
  mergeGridDown(frame, only.id);
  assert.equal(frame.grids.length, 1);
  assert.equal(frame.grids[0], only);
});

test('stylesEqual compares fill/stroke/effects, matching solid colors, gradients (by stops), and ignoring unrelated identity', () => {
  assert.ok(stylesEqual({ fill: '#ff0000', effects: [] }, { fill: '#ff0000', effects: [] }));
  assert.ok(!stylesEqual({ fill: '#ff0000', effects: [] }, { fill: '#00ff00', effects: [] }));

  const gradientA = { fill: { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] }, effects: [] };
  const gradientB = { fill: { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] }, effects: [] };
  assert.ok(stylesEqual(gradientA, gradientB));

  const gradientC = { fill: { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#111' }] }, effects: [] };
  assert.ok(!stylesEqual(gradientA, gradientC));

  assert.ok(!stylesEqual({ fill: '#fff', stroke: { color: '#000', width: 1 }, effects: [] }, { fill: '#fff', effects: [] }));
  assert.ok(!stylesEqual({ fill: '#fff', effects: [{ kind: 'glow' }] }, { fill: '#fff', effects: [] }));
});

// --- Flip/rotate (Checkpoint 6) ---

test('flipPixelsH mirrors each row horizontally', () => {
  const pixels = new Uint8Array([1, 0, 0, 0, 1, 1]); // 3x2
  assert.deepEqual(Array.from(flipPixelsH(3, 2, pixels)), [0, 0, 1, 1, 1, 0]);
});

test('flipPixelsV mirrors rows top-to-bottom', () => {
  const pixels = new Uint8Array([1, 0, 0, 0, 1, 1]); // 3x2
  assert.deepEqual(Array.from(flipPixelsV(3, 2, pixels)), [0, 1, 1, 1, 0, 0]);
});

test('rotatePixels90 rotates clockwise and swaps width/height', () => {
  // 2x3: row0=[1,0] row1=[0,1] row2=[1,1]
  const pixels = new Uint8Array([1, 0, 0, 1, 1, 1]);
  const rotated = rotatePixels90(2, 3, pixels);
  assert.equal(rotated.width, 3);
  assert.equal(rotated.height, 2);
  assert.deepEqual(Array.from(rotated.pixels), [1, 0, 1, 1, 1, 0]);
});

test('flipGridH mirrors a Grid\'s own buffer in place, bounding box unchanged (mirrors around its own center)', () => {
  const grid = { offsetX: 5, offsetY: 3, width: 3, height: 2, pixels: new Uint8Array([1, 0, 0, 0, 1, 1]) };
  flipGridH(grid);
  assert.equal(grid.offsetX, 5);
  assert.equal(grid.offsetY, 3);
  assert.equal(grid.width, 3);
  assert.equal(grid.height, 2);
  assert.deepEqual(Array.from(grid.pixels), [0, 0, 1, 1, 1, 0]);
});

test('flipGridV mirrors a Grid\'s own buffer in place, bounding box unchanged', () => {
  const grid = { offsetX: 5, offsetY: 3, width: 3, height: 2, pixels: new Uint8Array([1, 0, 0, 0, 1, 1]) };
  flipGridV(grid);
  assert.equal(grid.offsetX, 5);
  assert.equal(grid.offsetY, 3);
  assert.deepEqual(Array.from(grid.pixels), [0, 1, 1, 1, 0, 0]);
});

test('rotateGrid90 swaps width/height and keeps the shape\'s own center fixed', () => {
  const grid = { offsetX: 10, offsetY: 10, width: 4, height: 2, pixels: new Uint8Array(8).fill(1) };
  rotateGrid90(grid);
  assert.equal(grid.width, 2);
  assert.equal(grid.height, 4);
  // old center = (10+2, 10+1) = (12, 11); new offset = center - newSize/2
  assert.equal(grid.offsetX, 11); // 12 - 1
  assert.equal(grid.offsetY, 9); // 11 - 2
});

// --- transformGridRegion (Checkpoint 2, revised): partial-region flip/rotate ---

test('transformGridRegion flipH moves a single pixel to its mirrored position within rect, growing the grid to follow it', () => {
  const grid = { offsetX: 1, offsetY: 0, width: 1, height: 1, pixels: new Uint8Array([1]) };
  const changed = transformGridRegion(grid, { x0: 0, y0: 0, x1: 3, y1: 0 }, 'flipH');
  assert.equal(changed, true);
  assert.equal(grid.offsetX, 2); // dx=1 -> ndx=4-1-1=2
  assert.equal(grid.offsetY, 0);
  assert.equal(grid.width, 1);
  assert.equal(grid.height, 1);
  assert.deepEqual(Array.from(grid.pixels), [1]);
});

test('transformGridRegion only transforms the portion of the grid inside rect, leaving the rest of the same grid untouched', () => {
  // A 4-wide row: x0..x3 = [1,1,0,1]. rect covers only x1..x2 (the middle two cells).
  const grid = { offsetX: 0, offsetY: 0, width: 4, height: 1, pixels: new Uint8Array([1, 1, 0, 1]) };
  const changed = transformGridRegion(grid, { x0: 1, y0: 0, x1: 2, y1: 0 }, 'flipH');
  assert.equal(changed, true);
  // x1 (set) mirrors to x2; x2 (unset) mirrors to x1 -- only x1's pixel actually moves.
  // x0 and x3, outside rect, must be exactly as they started.
  assert.deepEqual(Array.from(grid.pixels), [1, 0, 1, 1]);
  assert.equal(grid.offsetX, 0);
  assert.equal(grid.width, 4);
});

test('transformGridRegion is a no-op and returns false when the grid has no pixels inside rect', () => {
  const grid = { offsetX: 10, offsetY: 10, width: 2, height: 2, pixels: new Uint8Array([1, 1, 1, 1]) };
  const before = { ...grid, pixels: grid.pixels.slice() };
  const changed = transformGridRegion(grid, { x0: 0, y0: 0, x1: 1, y1: 1 }, 'flipH');
  assert.equal(changed, false);
  assert.equal(grid.offsetX, before.offsetX);
  assert.equal(grid.width, before.width);
  assert.deepEqual(Array.from(grid.pixels), Array.from(before.pixels));
});

test('transformGridRegion rotate90 matches rotatePixels90\'s direction (90deg clockwise), remapped around rect', () => {
  const grid = { offsetX: 2, offsetY: 0, width: 1, height: 1, pixels: new Uint8Array([1]) }; // single pixel at abs (2,0)
  const changed = transformGridRegion(grid, { x0: 0, y0: 0, x1: 2, y1: 0 }, 'rotate90');
  assert.equal(changed, true);
  // dx=2,dy=0 in a 3-wide,1-tall rect -> ndx = height-1-dy = 0, ndy = dx = 2 -> abs (0,2)
  assert.equal(grid.offsetX, 0);
  assert.equal(grid.offsetY, 2);
  assert.equal(grid.width, 1);
  assert.equal(grid.height, 1);
  assert.deepEqual(Array.from(grid.pixels), [1]);
});

test('transformGridRegion never touches non-geometry fields (style, id, ...) -- a pure buffer/offset operation', () => {
  const grid = {
    id: 'grid-abc',
    style: { fill: { type: 'linear-gradient', angle: 0, stops: [] }, effects: [{ type: 'glow' }] },
    offsetX: 0,
    offsetY: 0,
    width: 2,
    height: 1,
    pixels: new Uint8Array([1, 0]),
  };
  const styleBefore = grid.style;
  transformGridRegion(grid, { x0: 0, y0: 0, x1: 1, y1: 0 }, 'flipH');
  assert.equal(grid.id, 'grid-abc');
  assert.equal(grid.style, styleBefore, 'style object reference must be untouched, not cloned/replaced/flattened');
});
