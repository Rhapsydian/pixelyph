// Object select-and-drag: click directly on a shape/layer to select and
// move it, distinct from marqueeSelect's rect-select-then-move and from
// arrow-key nudge. Mirrors nudge's target priority (Checkpoint 2): Shape
// tier drags whichever shape was hit, Pixel tier/Glyph mode drags the
// whole active layer's current-frame content. Uses the same
// live-update-then-commit-once split as painting (paintCellLive +
// commitStroke) so a full drag gesture is exactly one undo entry.

export const targetMoveTool = {
  onPointerDown(ctx, x, y) {
    if (ctx.tier === 'advanced') {
      const hit = ctx.hitTestShape(x, y);
      if (!hit) {
        ctx.clearActiveGrid();
        ctx.drag.mode = null;
        return;
      }
      ctx.setActiveGridId(hit.layer.id, hit.grid.id);
      ctx.drag.mode = 'shape';
      ctx.drag.layerId = hit.layer.id;
      ctx.drag.gridId = hit.grid.id;
      ctx.drag.start = { x, y };
      ctx.drag.origin = { x: hit.grid.offsetX, y: hit.grid.offsetY };
      return;
    }

    ctx.drag.mode = 'layer';
    ctx.drag.layerId = ctx.activeLayerId;
    ctx.drag.frameIndex = ctx.frameIndex;
    ctx.drag.lastX = x;
    ctx.drag.lastY = y;
  },
  onPointerMove(ctx, x, y) {
    if (ctx.drag.mode === 'shape') {
      ctx.setGridPropsLive(ctx.drag.layerId, ctx.drag.gridId, {
        offsetX: ctx.drag.origin.x + (x - ctx.drag.start.x),
        offsetY: ctx.drag.origin.y + (y - ctx.drag.start.y),
      });
    } else if (ctx.drag.mode === 'layer') {
      ctx.nudgeLayerFrameLive(ctx.drag.layerId, ctx.drag.frameIndex, x - ctx.drag.lastX, y - ctx.drag.lastY);
      ctx.drag.lastX = x;
      ctx.drag.lastY = y;
    }
  },
  onPointerUp(ctx) {
    if (ctx.drag.mode) ctx.commitStroke();
    ctx.drag.mode = null;
  },
};
