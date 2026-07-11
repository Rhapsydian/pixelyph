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

/**
 * Forward: a 0-1 objectBoundingBox fraction (fx,fy) -> canvas-cell-space
 * point within `bounds` — generic, unclamped. Shared by every point-style
 * gradient handle (radial center, linear endpoints, focal point).
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} bounds
 * @param {number} fx
 * @param {number} fy
 * @returns {{x:number,y:number}}
 */
export function fractionToCanvasPoint(bounds, fx, fy) {
  return {
    x: bounds.minX + fx * (bounds.maxX - bounds.minX),
    y: bounds.minY + fy * (bounds.maxY - bounds.minY),
  };
}

/**
 * Inverse of fractionToCanvasPoint — a raw canvas-cell-space point ->
 * 0-1 objectBoundingBox fraction, unclamped.
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} bounds
 * @param {number} px
 * @param {number} py
 * @returns {{fx:number,fy:number}}
 */
export function canvasPointToFraction(bounds, px, py) {
  return {
    fx: (px - bounds.minX) / (bounds.maxX - bounds.minX),
    fy: (py - bounds.minY) / (bounds.maxY - bounds.minY),
  };
}

/** Radial gradient's `r` can never reach zero/negative through the drag handle — SVG treats r<=0 as "no gradient". */
export const MIN_RADIAL_R = 0.02;

/**
 * Forward: a radial gradient's center (cx,cy) + radius (r), all 0-1
 * fractions -> the on-canvas position of the radius-edge drag handle,
 * placed along the horizontal spoke from center (matching the wireframe's
 * `(cx+r, cy)` convention — a single scalar `r` has no natural per-axis
 * direction on a non-square bounds, so the handle always sits due "east"
 * of center).
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} bounds
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @returns {{x:number,y:number}}
 */
export function radialEdgeCanvasPosition(bounds, cx, cy, r) {
  return fractionToCanvasPoint(bounds, cx + r, cy);
}

/**
 * Inverse of radialEdgeCanvasPosition — only the horizontal component of
 * the drag point matters (dragging the radius handle moves it along its
 * fixed horizontal spoke), floored at MIN_RADIAL_R so `r` can't collapse to
 * zero/negative even if dragged past or onto the center.
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} bounds
 * @param {number} px canvas-cell-space x
 * @param {number} cx center x, 0-1 fraction
 * @returns {number} r, 0-1 fraction, >= MIN_RADIAL_R
 */
export function radialRadiusFromDrag(bounds, px, cx) {
  const fx = (px - bounds.minX) / (bounds.maxX - bounds.minX);
  return Math.max(MIN_RADIAL_R, fx - cx);
}

// SVG renders a radial gradient oddly when its focal point sits exactly on
// (or numerically indistinguishable from) the radius boundary — the cone
// between fx/fy and the circle edge degenerates and produces a visible hard
// seam in some browsers. Clamping to a hair inside the true radius avoids
// that without being a visually noticeable inset.
const FOCAL_MAX_RADIUS_FACTOR = 0.97;

/**
 * Keeps a radial gradient's focal point within its radius — if (fx,fy) is
 * further than `r * FOCAL_MAX_RADIUS_FACTOR` from (cx,cy) (Euclidean, in the
 * same fraction space cx/cy/r already live in), scales it back to that
 * slightly-inset boundary instead of escaping the circle (or sitting
 * exactly on its edge, which renders oddly — see FOCAL_MAX_RADIUS_FACTOR).
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} fx
 * @param {number} fy
 * @returns {{fx:number,fy:number}}
 */
export function clampPointToRadius(cx, cy, r, fx, fy) {
  const maxDist = r * FOCAL_MAX_RADIUS_FACTOR;
  const dx = fx - cx;
  const dy = fy - cy;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxDist || dist === 0) return { fx, fy };
  const scale = maxDist / dist;
  return { fx: cx + dx * scale, fy: cy + dy * scale };
}

/**
 * Keeps a radial gradient's explicitly-set focal point moving with its
 * center — when (cx,cy) is dragged, shifts (fx,fy) by the same delta so the
 * focal point's offset from center stays constant, instead of drifting to a
 * different relative position (or outside the radius entirely) every time
 * the center moves. A no-op (returns {}) when fx/fy hasn't been explicitly
 * set — an unset focal point already tracks center via its `fx ?? cx`
 * fallback, so there's nothing to translate.
 * @param {{cx:number,cy:number,fx?:number,fy?:number}} fill current fill, before the center change
 * @param {number} newCx
 * @param {number} newCy
 * @returns {{fx:number,fy:number}|{}}
 */
export function translateFocalPoint(fill, newCx, newCy) {
  if (fill.fx == null || fill.fy == null) return {};
  return { fx: fill.fx + (newCx - fill.cx), fy: fill.fy + (newCy - fill.cy) };
}

/**
 * Keeps a radial gradient's explicitly-set focal point at the same relative
 * distance from center when the radius changes — scales (fx,fy)'s offset
 * from (cx,cy) by newR/r, so e.g. a focal point sitting at 60% of the
 * radius stays at 60% of the radius after a resize, rather than staying at
 * a fixed absolute distance that could end up outside a shrunk radius. A
 * no-op (returns {}) when fx/fy hasn't been explicitly set. Proportional
 * scaling preserves clampPointToRadius's margin automatically (if the old
 * offset was within `r * FOCAL_MAX_RADIUS_FACTOR`, the rescaled offset is
 * within `newR * FOCAL_MAX_RADIUS_FACTOR` too), so no reclamping is needed.
 * @param {{cx:number,cy:number,r:number,fx?:number,fy?:number}} fill current fill, before the radius change
 * @param {number} newR
 * @returns {{fx:number,fy:number}|{}}
 */
export function rescaleFocalPoint(fill, newR) {
  if (fill.fx == null || fill.fy == null) return {};
  if (!fill.r) return {}; // r is always >= MIN_RADIAL_R in practice; guard division defensively anyway
  const scale = newR / fill.r;
  return { fx: fill.cx + (fill.fx - fill.cx) * scale, fy: fill.cy + (fill.fy - fill.cy) * scale };
}
