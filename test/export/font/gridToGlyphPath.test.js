import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridToGlyphPath } from '../../../src/export/font/gridToGlyphPath.js';

// Ray-casting nonzero winding number at (px, py) against a Path built only
// from straight M/L/Z commands (all our glyphs are axis-aligned polygons).
function windingNumber(path, px, py) {
  let winding = 0;
  let start = null;
  let prev = null;
  const segments = [];
  for (const cmd of path.commands) {
    if (cmd.type === 'M') {
      start = { x: cmd.x, y: cmd.y };
      prev = start;
    } else if (cmd.type === 'L') {
      segments.push([prev, { x: cmd.x, y: cmd.y }]);
      prev = { x: cmd.x, y: cmd.y };
    } else if (cmd.type === 'Z') {
      segments.push([prev, start]);
      prev = start;
    }
  }
  for (const [a, b] of segments) {
    if (a.y <= py !== b.y <= py) {
      const t = (py - a.y) / (b.y - a.y);
      if (a.x + t * (b.x - a.x) > px) winding += b.y > a.y ? 1 : -1;
    }
  }
  return winding;
}

test('gridToGlyphPath maps grid coordinates to font em-space (y-flip + scale + offset)', () => {
  const grid = { width: 1, height: 1, pixels: new Uint8Array([1]) };
  const path = gridToGlyphPath(grid, { scale: 100, baselineRow: 1, offsetX: 50 });
  // A single filled cell at grid (0,0)-(1,1) traces 'M0 0H1V1H0Z' -> contour
  // [{0,0},{1,0},{1,1},{0,1}]. fontX = x*100+50, fontY = (1-y)*100.
  assert.deepEqual(
    path.commands.map((c) => ({ type: c.type, x: c.x, y: c.y })),
    [
      { type: 'M', x: 50, y: 100 },
      { type: 'L', x: 150, y: 100 },
      { type: 'L', x: 150, y: 0 },
      { type: 'L', x: 50, y: 0 },
      { type: 'Z', x: undefined, y: undefined },
    ],
  );
});

test('gridToGlyphPath preserves opposite winding between an outer contour and its hole (nonzero fill rule)', () => {
  // The pixelloom README's 3x3 ring: full border, empty center cell.
  const grid = { width: 3, height: 3, pixels: new Uint8Array([1, 1, 1, 1, 0, 1, 1, 1, 1]) };
  const path = gridToGlyphPath(grid, { scale: 10, baselineRow: 3 });
  assert.notEqual(windingNumber(path, 5, 15), 0); // inside the ring (outside the hole) -> filled
  assert.equal(windingNumber(path, 15, 15), 0); // inside the hole -> not filled
  assert.equal(windingNumber(path, 35, 35), 0); // fully outside -> not filled
});

test('gridToGlyphPath on an empty grid produces an empty path', () => {
  const grid = { width: 2, height: 2, pixels: new Uint8Array(4) };
  const path = gridToGlyphPath(grid, { scale: 10, baselineRow: 2 });
  assert.equal(path.commands.length, 0);
});
