import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetMoveTool } from '../../../../src/ui/draw/tools/targetMove.js';

// Minimal mock ctx -- targetMoveTool only touches drag (a plain mutable
// ref), tier/selectionScope/activeLayerId/frameIndex getters, hitTestShape,
// setActiveGridId/clearActiveGrid, and setGridPropsLive/nudgeLayerFrameLive
// + commitStroke.
function makeCtx({ tier = 'advanced', selectionScope = 'activeShape', hit = null, activeLayerId = 'layer-active', frameIndex = 0 } = {}) {
  const calls = { setActiveGridId: [], clearActiveGrid: 0, setGridPropsLive: [], nudgeLayerFrameLive: [], commitStroke: 0 };
  return {
    drag: {},
    tier,
    selectionScope,
    activeLayerId,
    frameIndex,
    hitTestShape: () => hit,
    setActiveGridId: (layerId, gridId) => calls.setActiveGridId.push({ layerId, gridId }),
    clearActiveGrid: () => calls.clearActiveGrid++,
    setGridPropsLive: (layerId, gridId, patch) => calls.setGridPropsLive.push({ layerId, gridId, patch }),
    nudgeLayerFrameLive: (layerId, frameIdx, dx, dy) => calls.nudgeLayerFrameLive.push({ layerId, frameIdx, dx, dy }),
    commitStroke: () => calls.commitStroke++,
    calls,
  };
}

test('Shape tier, "Select from: Active shape" (default): drags only the hit shape', () => {
  const hit = { layer: { id: 'layer-1' }, grid: { id: 'grid-1', offsetX: 3, offsetY: 4 } };
  const ctx = makeCtx({ hit });

  targetMoveTool.onPointerDown(ctx, 5, 5);
  assert.equal(ctx.drag.mode, 'shape', 'activeShape scope drags a single shape, not the whole layer');
  assert.deepEqual(ctx.calls.setActiveGridId, [{ layerId: 'layer-1', gridId: 'grid-1' }]);

  targetMoveTool.onPointerMove(ctx, 8, 9);
  assert.deepEqual(ctx.calls.setGridPropsLive, [{ layerId: 'layer-1', gridId: 'grid-1', patch: { offsetX: 6, offsetY: 8 } }]);
  assert.equal(ctx.calls.nudgeLayerFrameLive.length, 0, 'activeShape scope never touches sibling shapes in the layer');

  targetMoveTool.onPointerUp(ctx);
  assert.equal(ctx.calls.commitStroke, 1);
});

test('Shape tier, "Select from: Active layer": hit-tests the topmost visible shape, but drags every shape in that shape\'s layer together', () => {
  const hit = { layer: { id: 'layer-1' }, grid: { id: 'grid-1', offsetX: 3, offsetY: 4 } };
  const ctx = makeCtx({ selectionScope: 'activeLayer', hit });

  targetMoveTool.onPointerDown(ctx, 5, 5);
  assert.equal(ctx.drag.mode, 'layer', 'activeLayer scope drags the whole layer, not just the hit shape');
  assert.equal(ctx.drag.layerId, 'layer-1', 'targets the hit shape\'s own layer');
  assert.deepEqual(ctx.calls.setActiveGridId, [{ layerId: 'layer-1', gridId: 'grid-1' }], 'the hit shape still becomes active (Style panel target), even though the whole layer moves');

  targetMoveTool.onPointerMove(ctx, 8, 7);
  assert.deepEqual(ctx.calls.nudgeLayerFrameLive, [{ layerId: 'layer-1', frameIdx: 0, dx: 3, dy: 2 }], 'moves every grid in the hit shape\'s layer by the drag delta, not just the hit grid');
  assert.equal(ctx.calls.setGridPropsLive.length, 0, 'activeLayer scope never single-shape-drags via setGridPropsLive');

  targetMoveTool.onPointerUp(ctx);
  assert.equal(ctx.calls.commitStroke, 1, 'still exactly one commit for the whole drag, same as activeShape scope');
});

test('Shape tier: clicking empty canvas clears the active shape regardless of scope', () => {
  for (const selectionScope of ['activeShape', 'activeLayer']) {
    const ctx = makeCtx({ selectionScope, hit: null });
    targetMoveTool.onPointerDown(ctx, 5, 5);
    assert.equal(ctx.calls.clearActiveGrid, 1);
    assert.equal(ctx.drag.mode, null);
  }
});

test('Pixel tier / Glyph mode: always drags the whole active layer, regardless of selectionScope', () => {
  const ctx = makeCtx({ tier: 'simple', selectionScope: 'activeLayer', activeLayerId: 'layer-simple' });
  targetMoveTool.onPointerDown(ctx, 2, 2);
  assert.equal(ctx.drag.mode, 'layer');
  assert.equal(ctx.drag.layerId, 'layer-simple');

  targetMoveTool.onPointerMove(ctx, 4, 3);
  assert.deepEqual(ctx.calls.nudgeLayerFrameLive, [{ layerId: 'layer-simple', frameIdx: 0, dx: 2, dy: 1 }]);
});
