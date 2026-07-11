import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGrid, set } from '../../../src/model/Grid.js';
import {
  gradientBoundsCanvasSpace,
  gradientHandlePosition,
  gradientBoundsCenter,
  angleFromHandleDrag,
  ANGLE_HANDLE_LENGTH,
  fractionToCanvasPoint,
  canvasPointToFraction,
  radialEdgeCanvasPosition,
  radialRadiusFromDrag,
  MIN_RADIAL_R,
  clampPointToRadius,
} from '../../../src/ui/draw/gradientHandleGeometry.js';

function mockGrid({ width, height, offsetX, offsetY, painted }) {
  const grid = createGrid(width, height);
  grid.offsetX = offsetX;
  grid.offsetY = offsetY;
  for (const [x, y] of painted) set(grid, x, y, 1);
  return grid;
}

test('gradientBoundsCanvasSpace: a single painted pixel yields a 1x1 box in canvas space', () => {
  const grid = mockGrid({ width: 5, height: 5, offsetX: 10, offsetY: 20, painted: [[2, 3]] });
  assert.deepEqual(gradientBoundsCanvasSpace(grid), { minX: 12, minY: 23, maxX: 13, maxY: 24 });
});

test('gradientBoundsCanvasSpace: a fully empty grid returns null', () => {
  const grid = mockGrid({ width: 4, height: 4, offsetX: 0, offsetY: 0, painted: [] });
  assert.equal(gradientBoundsCanvasSpace(grid), null);
});

test('gradientHandlePosition: angle 0 lands ANGLE_HANDLE_LENGTH to the right of the bbox center', () => {
  const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const { x, y } = gradientHandlePosition(bounds, 0);
  assert.ok(Math.abs(x - (5 + ANGLE_HANDLE_LENGTH)) < 1e-9);
  assert.ok(Math.abs(y - 5) < 1e-9);
});

test('gradientHandlePosition: angle 90 lands ANGLE_HANDLE_LENGTH below the bbox center (SVG y-down)', () => {
  const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const { x, y } = gradientHandlePosition(bounds, 90);
  assert.ok(Math.abs(x - 5) < 1e-9);
  assert.ok(Math.abs(y - (5 + ANGLE_HANDLE_LENGTH)) < 1e-9);
});

test('gradientHandlePosition: spoke length is independent of bbox size', () => {
  const small = { minX: 0, minY: 0, maxX: 2, maxY: 2 };
  const large = { minX: 0, minY: 0, maxX: 200, maxY: 200 };
  const smallHandle = gradientHandlePosition(small, 0);
  const largeHandle = gradientHandlePosition(large, 0);
  const smallCenter = gradientBoundsCenter(small);
  const largeCenter = gradientBoundsCenter(large);
  const smallDist = Math.hypot(smallHandle.x - smallCenter.x, smallHandle.y - smallCenter.y);
  const largeDist = Math.hypot(largeHandle.x - largeCenter.x, largeHandle.y - largeCenter.y);
  assert.ok(Math.abs(smallDist - ANGLE_HANDLE_LENGTH) < 1e-9);
  assert.ok(Math.abs(largeDist - ANGLE_HANDLE_LENGTH) < 1e-9);
});

test('gradientBoundsCenter: returns the bbox midpoint', () => {
  const bounds = { minX: 2, minY: 4, maxX: 12, maxY: 8 };
  assert.deepEqual(gradientBoundsCenter(bounds), { x: 7, y: 6 });
});

test('angleFromHandleDrag: inverts gradientHandlePosition at cardinal angles', () => {
  const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const right = gradientHandlePosition(bounds, 0);
  assert.ok(Math.abs(angleFromHandleDrag(bounds, right.x, right.y) - 0) < 1e-9);
  const bottom = gradientHandlePosition(bounds, 90);
  assert.ok(Math.abs(angleFromHandleDrag(bounds, bottom.x, bottom.y) - 90) < 1e-9);
});

test('fractionToCanvasPoint: maps corners and center of a non-square bounds', () => {
  const bounds = { minX: 2, minY: 4, maxX: 12, maxY: 8 };
  assert.deepEqual(fractionToCanvasPoint(bounds, 0, 0), { x: 2, y: 4 });
  assert.deepEqual(fractionToCanvasPoint(bounds, 1, 1), { x: 12, y: 8 });
  assert.deepEqual(fractionToCanvasPoint(bounds, 0.5, 0.5), { x: 7, y: 6 });
});

test('fractionToCanvasPoint/canvasPointToFraction round-trip, including unclamped fractions outside 0-1', () => {
  const bounds = { minX: -4, minY: 5, maxX: 20, maxY: 9 };
  for (const [fx, fy] of [[0, 0], [1, 1], [0.3, 0.7], [-0.5, 1.5]]) {
    const { x, y } = fractionToCanvasPoint(bounds, fx, fy);
    const back = canvasPointToFraction(bounds, x, y);
    assert.ok(Math.abs(back.fx - fx) < 1e-9);
    assert.ok(Math.abs(back.fy - fy) < 1e-9);
  }
});

test('radialEdgeCanvasPosition: sits due east of center at distance r (fraction space), on a non-square bounds', () => {
  const bounds = { minX: 0, minY: 0, maxX: 20, maxY: 10 };
  const point = radialEdgeCanvasPosition(bounds, 0.5, 0.5, 0.25);
  assert.deepEqual(point, { x: 15, y: 5 }); // cx+r=0.75 -> 0.75*20=15; cy=0.5 -> 0.5*10=5
});

test('radialRadiusFromDrag: recovers r from a canvas-space drag point, ignoring the drag\'s y component', () => {
  const bounds = { minX: 0, minY: 0, maxX: 20, maxY: 10 };
  const point = radialEdgeCanvasPosition(bounds, 0.5, 0.5, 0.25);
  assert.ok(Math.abs(radialRadiusFromDrag(bounds, point.x, 0.5) - 0.25) < 1e-9);
  // dragging past center still floors at MIN_RADIAL_R, never zero/negative
  assert.equal(radialRadiusFromDrag(bounds, bounds.minX, 0.5), MIN_RADIAL_R);
  assert.equal(radialRadiusFromDrag(bounds, bounds.minX - 100, 0.5), MIN_RADIAL_R);
});

test('clampPointToRadius: a point inside the radius passes through unchanged', () => {
  assert.deepEqual(clampPointToRadius(0.5, 0.5, 0.3, 0.55, 0.5), { fx: 0.55, fy: 0.5 });
});

test('clampPointToRadius: a point exactly on the boundary passes through unchanged', () => {
  const result = clampPointToRadius(0.5, 0.5, 0.3, 0.8, 0.5);
  assert.ok(Math.abs(result.fx - 0.8) < 1e-9);
  assert.ok(Math.abs(result.fy - 0.5) < 1e-9);
});

test('clampPointToRadius: a point outside the radius scales back to the boundary, preserving direction', () => {
  const result = clampPointToRadius(0.5, 0.5, 0.3, 1.5, 0.5); // 1.0 away, due east
  assert.ok(Math.abs(result.fx - 0.8) < 1e-9); // 0.5 + 0.3
  assert.ok(Math.abs(result.fy - 0.5) < 1e-9);
  const dist = Math.hypot(result.fx - 0.5, result.fy - 0.5);
  assert.ok(Math.abs(dist - 0.3) < 1e-9);
});

test('clampPointToRadius: a point exactly at the center is left unchanged (no direction to scale along)', () => {
  assert.deepEqual(clampPointToRadius(0.5, 0.5, 0.3, 0.5, 0.5), { fx: 0.5, fy: 0.5 });
});

test('round-trip: angleFromHandleDrag(gradientHandlePosition(angle)) recovers angle, including on non-square bounds', () => {
  const boundsList = [
    { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    { minX: 3, minY: 5, maxX: 20, maxY: 9 },
    { minX: -4, minY: -4, maxX: 4, maxY: 30 },
  ];
  for (const bounds of boundsList) {
    for (const angle of [0, 37, 90, 179, -45, 123.4]) {
      const { x, y } = gradientHandlePosition(bounds, angle);
      const recovered = angleFromHandleDrag(bounds, x, y);
      const diff = ((recovered - angle + 540) % 360) - 180;
      assert.ok(Math.abs(diff) < 1e-9, `expected ${recovered} to match ${angle} mod 360 for bounds ${JSON.stringify(bounds)}`);
    }
  }
});
