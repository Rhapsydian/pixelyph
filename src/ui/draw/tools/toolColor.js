// Shared by every tool that supports "right-click to erase" (pencil,
// bucketFill, line, rectangle, ellipse): SvgPixelEditor sets ctx.erasing
// from the pointer button at gesture start (see handlePointerDown), and
// these two helpers turn that into (a) the color actually painted — `null`
// clears a cell, same as the dedicated eraser tool — and (b) a distinct
// tint for line/shape drag previews, since a raw `fill={null}` preview
// would silently default to solid black instead of indicating an erase.

export const ERASE_PREVIEW_COLOR = '#ff5252';

/** @returns {string|null} */
export function resolvePaintColor(ctx) {
  return ctx.erasing ? null : ctx.activeColor;
}

/** @returns {string} */
export function resolvePreviewColor(ctx) {
  return ctx.erasing ? ERASE_PREVIEW_COLOR : ctx.activeColor;
}
