// Rectangular marquee: drag once to define the selection rect, then drag
// again starting inside it to move (plain drag) or copy (shift+drag) —
// dropping happens by clicking anywhere outside the floating buffer, or by
// switching tools (SvgPixelEditor commits any pending floating selection
// on tool change). Reads/writes go through the store's getters so a
// gesture that spans multiple calls (down -> move -> up) always sees the
// latest selection/floatingSelection, not a stale render-time snapshot.

function normalizeRect(x0, y0, x1, y1) {
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}

function pointInRect(x, y, rect) {
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

export const marqueeSelectTool = {
  onPointerDown(ctx, x, y) {
    const floating = ctx.getFloatingSelection();
    if (floating) {
      const rect = { x0: floating.x, y0: floating.y, x1: floating.x + floating.width - 1, y1: floating.y + floating.height - 1 };
      if (pointInRect(x, y, rect)) {
        ctx.drag.mode = 'moving';
        ctx.drag.start = { x, y };
        ctx.drag.origin = { x: floating.x, y: floating.y };
        return;
      }
      ctx.dropFloatingSelection();
    }

    const selection = ctx.getSelection();
    if (selection && pointInRect(x, y, normalizeRect(selection.x0, selection.y0, selection.x1, selection.y1))) {
      ctx.liftSelection(!ctx.shiftKey); // plain drag moves (destructive); shift+drag copies
      const lifted = ctx.getFloatingSelection();
      ctx.drag.mode = 'moving';
      ctx.drag.start = { x, y };
      ctx.drag.origin = { x: lifted.x, y: lifted.y };
      return;
    }

    ctx.drag.mode = 'selecting';
    ctx.startSelection(x, y);
  },
  onPointerMove(ctx, x, y) {
    if (ctx.drag.mode === 'selecting') {
      ctx.updateSelection(x, y);
    } else if (ctx.drag.mode === 'moving') {
      ctx.moveFloatingSelection(ctx.drag.origin.x + (x - ctx.drag.start.x), ctx.drag.origin.y + (y - ctx.drag.start.y));
    }
  },
  onPointerUp(ctx) {
    ctx.drag.mode = null;
  },
};
