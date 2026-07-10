// Pure geometry for the on-canvas linear-gradient angle handle
// (GradientAngleHandle.jsx) — forward (angle -> handle position) and
// inverse (drag position -> angle) math, kept separate from the component
// so it's unit-testable without any DOM/pointer-event setup.

import { minimalBounds } from '../../model/Grid.js';
import { angleFromVector } from '../../export/svg/layerStyle.js';

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
 * Forward: angle (degrees) -> the gradient's "positive end" point (x2,y2 in
 * serializeFill's terms), mapped into canvas-cell-space via `bounds`. This
 * is where the draggable handle renders.
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} bounds
 * @param {number} angle degrees
 * @returns {{x:number,y:number}}
 */
export function gradientHandlePosition(bounds, angle) {
  const rad = (angle * Math.PI) / 180;
  const fx = 0.5 + Math.cos(rad) * 0.5;
  const fy = 0.5 + Math.sin(rad) * 0.5;
  return {
    x: bounds.minX + fx * (bounds.maxX - bounds.minX),
    y: bounds.minY + fy * (bounds.maxY - bounds.minY),
  };
}

/** @returns {{x:number,y:number}} the bbox center, in canvas-cell-space — the drag pivot / line-start for the handle's visual spoke. */
export function gradientBoundsCenter(bounds) {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

/**
 * Inverse: a raw pointer position in canvas-cell-space (float, pre-floor —
 * same space clientToCell's px/py are in before flooring) -> the angle that
 * would put the handle there. bounds.maxX-bounds.minX / maxY-minY are
 * always >= 1 whenever bounds is non-null (see gradientBoundsCanvasSpace),
 * so no divide-by-zero guard is needed here.
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} bounds
 * @param {number} px canvas-cell-space x
 * @param {number} py canvas-cell-space y
 * @returns {number} angle in degrees
 */
export function angleFromHandleDrag(bounds, px, py) {
  const fx = (px - bounds.minX) / (bounds.maxX - bounds.minX);
  const fy = (py - bounds.minY) / (bounds.maxY - bounds.minY);
  return angleFromVector(fx - 0.5, fy - 0.5);
}
