import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pencilTool } from '../../../../src/ui/draw/tools/pencil.js';

// Minimal mock ctx — pencilTool only touches drag (a plain mutable ref),
// brushWidth/ditherEnabled/pixelPerfect getters, activeColor, erasing, and
// paintCellLive/commitStroke.
function makeCtx({ brushWidth = 1, ditherEnabled = false, pixelPerfect = false } = {}) {
  const painted = [];
  return {
    drag: {},
    brushWidth,
    ditherEnabled,
    pixelPerfect,
    activeColor: '#000000',
    erasing: false,
    paintCellLive: (x, y) => painted.push({ x, y }),
    commitStroke: () => {},
    painted,
  };
}

test('pencil paints a single cell per sample at brushWidth 1, pixelPerfect off', () => {
  const ctx = makeCtx();
  pencilTool.onPointerDown(ctx, 0, 0);
  pencilTool.onPointerMove(ctx, 1, 0);
  pencilTool.onPointerMove(ctx, 2, 0);
  pencilTool.onPointerUp(ctx);
  assert.deepEqual(ctx.painted, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
});

test('pencil fills the gap between two far-apart samples (fast-drag gap fix)', () => {
  const ctx = makeCtx();
  pencilTool.onPointerDown(ctx, 0, 0);
  pencilTool.onPointerMove(ctx, 3, 0); // a single low-frequency move event jumping 3 cells
  pencilTool.onPointerUp(ctx);
  assert.deepEqual(ctx.painted, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
});

test('pencil brush width stamps every cell of the width x width square', () => {
  const ctx = makeCtx({ brushWidth: 2 });
  pencilTool.onPointerDown(ctx, 0, 0);
  pencilTool.onPointerUp(ctx);
  assert.deepEqual(ctx.painted, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ]);
});

test('pencil dither paints only the checkerboard subset of the stamp', () => {
  const ctx = makeCtx({ brushWidth: 2, ditherEnabled: true });
  pencilTool.onPointerDown(ctx, 0, 0);
  pencilTool.onPointerUp(ctx);
  assert.deepEqual(ctx.painted, [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
});

test('pencil pixelPerfect drops a corner that only becomes known one sample later', () => {
  const ctx = makeCtx({ pixelPerfect: true });
  pencilTool.onPointerDown(ctx, 0, 0); // painted immediately (no prior anchor to buffer against)
  pencilTool.onPointerMove(ctx, 1, 0); // held back as `pending` — corner-ness not yet knowable
  pencilTool.onPointerMove(ctx, 1, 1); // reveals (1,0) as a corner between (0,0) and (1,1) -> dropped
  pencilTool.onPointerUp(ctx); // flushes (1,1), the final pending point
  assert.deepEqual(ctx.painted, [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
});

test('pencil pixelPerfect keeps a genuine diagonal path with no corners', () => {
  const ctx = makeCtx({ pixelPerfect: true });
  pencilTool.onPointerDown(ctx, 0, 0);
  pencilTool.onPointerMove(ctx, 1, 1);
  pencilTool.onPointerMove(ctx, 2, 2);
  pencilTool.onPointerUp(ctx);
  assert.deepEqual(ctx.painted, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]);
});

test('pencil pixelPerfect flushes a pending point at stroke end even with no corner decision', () => {
  const ctx = makeCtx({ pixelPerfect: true });
  pencilTool.onPointerDown(ctx, 0, 0);
  pencilTool.onPointerMove(ctx, 1, 0); // becomes pending, stroke ends before a 3rd point arrives
  pencilTool.onPointerUp(ctx);
  assert.deepEqual(ctx.painted, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
});
