// Pure geometry for the on-canvas linear-gradient angle handle
// (GradientAngleHandle.jsx) — forward (angle -> handle position) and
// inverse (drag position -> angle) math, kept separate from the component
// so it's unit-testable without any DOM/pointer-event setup.

import { minimalBounds } from '../../model/Grid.js';
import { angleFromVector } from '../../export/svg/layerStyle.js';

/** Fixed on-canvas length (cells) of the angle handle's spoke, independent of shape size. */
export const ANGLE_HANDLE_LENGTH = 2.5;

/**
 * @param {object} grid Grid (Shape) — offsetX/offsetY + width/height/pixels
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}|null} canvas-
 *   space bounding box of the shape's painted pixels (offset applied, +1'd
 *   so maxX/maxY are exclusive-style extents, not the last painted index) —
 *   or null if the grid is fully empty.
 */
export function gradientBoundsCanvasSpace(grid) {
  const b = minimalBounds(grid);
  if (!b) return null;
  return {
    minX: grid.offsetX + b.minX,
    minY: grid.offsetY + b.minY,
    maxX: grid.offsetX + b.maxX + 1,
    maxY: grid.offsetY + b.maxY + 1,
  };
}

/**
 * Forward: angle (degrees) -> the on-canvas position of the draggable
 * handle — a fixed `ANGLE_HANDLE_LENGTH` from the bbox center, regardless
 * of the shape's own size. This is a drag-handle affordance only;
 * `serializeFill`'s actual gradient vector math is unaffected.
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} bounds
 * @param {number} angle degrees
 * @returns {{x:number,y:number}}
 */
export function gradientHandlePosition(bounds, angle) {
  const rad = (angle * Math.PI) / 180;
  const center = gradientBoundsCenter(bounds);
  return {
    x: center.x + Math.cos(rad) * ANGLE_HANDLE_LENGTH,
    y: center.y + Math.sin(rad) * ANGLE_HANDLE_LENGTH,
  };
}

/** @returns {{x:number,y:number}} the bbox center, in canvas-cell-space — the drag pivot / line-start for the handle's visual spoke. */
export function gradientBoundsCenter(bounds) {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

/**
 * Inverse: a raw pointer position in canvas-cell-space (float, pre-floor —
 * same space clientToCell's px/py are in before flooring) -> the angle that
 * would put the handle there. Computed directly from the vector between the
 * drag point and the bbox center, so it matches gradientHandlePosition's
 * fixed-length, center-pivoted geometry (no bbox-size dependency).
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} bounds
 * @param {number} px canvas-cell-space x
 * @param {number} py canvas-cell-space y
 * @returns {number} angle in degrees
 */
export function angleFromHandleDrag(bounds, px, py) {
  const center = gradientBoundsCenter(bounds);
  return angleFromVector(px - center.x, py - center.y);
}
