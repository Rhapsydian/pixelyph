// Simple tier samples the underlying grid data directly (one color-index
// grid, so "the color of a cell" is unambiguous) rather than a rendered
// pixel — see Canvas.colorAt. No-ops on an empty cell; there's nothing to
// pick up there.

export const eyedropperTool = {
  onPointerDown(ctx, x, y) {
    const color = ctx.colorAt(x, y);
    if (color) ctx.setActiveColor(color);
  },
  onPointerMove() {},
  onPointerUp() {},
};
