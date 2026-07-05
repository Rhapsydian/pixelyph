// Simple tier samples the underlying grid data directly (one color-index
// grid, so "the color of a cell" is unambiguous) rather than a rendered
// pixel — see Canvas.colorAt. Advanced tier has no such unambiguous
// "the color" once gradient fills exist, so there it instead activates the
// topmost visible layer at that cell (making it the one further painting
// and the LayerStylePanel target) rather than trying to extract a color.
// Both branches no-op on an empty cell; there's nothing to pick up there.

export const eyedropperTool = {
  onPointerDown(ctx, x, y) {
    if (ctx.tier === 'advanced') {
      ctx.selectTopLayerAt(x, y);
      return;
    }
    const color = ctx.colorAt(x, y);
    if (color) ctx.setActiveColor(color);
  },
  onPointerMove() {},
  onPointerUp() {},
};
