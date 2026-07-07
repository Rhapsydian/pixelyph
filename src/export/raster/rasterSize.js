// Pure pixel-size math for raster export — shared by the simple preset
// dropdown (1x/4x/8x/16x) and the Export modal's "Advanced" dialog (custom
// scale, or a specific resolution with an optional locked aspect ratio).
// No DOM dependency, unlike rasterizeFrame.js/spriteSheet.js/animatedRaster.js
// which actually need a real <canvas>/Image to rasterize.

// Arbitrarily large custom resolutions (e.g. a typo'd extra zero) would hand
// a multi-hundred-megapixel canvas to the browser — clamp per side rather
// than let that hang/OOM the tab.
export const MAX_RASTER_DIMENSION = 4096;

/**
 * @param {number} baseWidth unscaled canvas width
 * @param {number} baseHeight unscaled canvas height
 * @param {number} scale uniform multiplier (may be non-integer, e.g. a custom 2.5x)
 * @returns {{ width: number, height: number }} integer output pixel dimensions
 */
export function sizeFromScale(baseWidth, baseHeight, scale) {
  return {
    width: clampDimension(Math.round(baseWidth * scale)),
    height: clampDimension(Math.round(baseHeight * scale)),
  };
}

/**
 * Recomputes the paired dimension so `newValue` (for whichever dimension
 * `changedDimension` names) preserves `baseWidth`/`baseHeight`'s aspect
 * ratio — the Export modal's "Lock aspect ratio" behavior.
 *
 * @param {number} baseWidth unscaled canvas width
 * @param {number} baseHeight unscaled canvas height
 * @param {'width'|'height'} changedDimension which field the user just edited
 * @param {number} newValue the new value for that field
 * @returns {{ width: number, height: number }}
 */
export function resizeLockedDimension(baseWidth, baseHeight, changedDimension, newValue) {
  const value = clampDimension(Math.max(1, Math.round(newValue)));
  const ratio = baseWidth / baseHeight;
  if (changedDimension === 'width') {
    return { width: value, height: clampDimension(Math.max(1, Math.round(value / ratio))) };
  }
  return { width: clampDimension(Math.max(1, Math.round(value * ratio))), height: value };
}

function clampDimension(value) {
  return Math.min(MAX_RASTER_DIMENSION, Math.max(1, value));
}
