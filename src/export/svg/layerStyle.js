// Attribute/def serialization for a Layer's `style` (fill + stroke) — pure
// string-building, shared verbatim between composeLayersSvg.js (export) and
// SvgPixelEditor.jsx (the live editing surface), so what you see while
// editing is exactly what exports (see the plan's "Editor rendering
// surface" section).

export function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * @param {string|object|null} fill Fill — solid color string, gradient object, or null
 * @param {string} gradientId a per-layer id, so multiple layers' gradients don't collide in one shared <defs>
 * @returns {{ attr: string, def: string }} `attr` goes in a `fill="..."` attribute; `def` is an
 *   optional <linearGradient>/<radialGradient> to place in <defs> ('' if fill is solid/none)
 */
export function serializeFill(fill, gradientId) {
  if (fill == null) return { attr: 'none', def: '' };
  if (typeof fill === 'string') return { attr: fill, def: '' };
  const stops = fill.stops.map((s) => `<stop offset="${s.offset}" stop-color="${escapeAttr(s.color)}"/>`).join('');
  if (fill.type === 'linear-gradient') {
    if (fill.mode === 'endpoints') {
      const def = `<linearGradient id="${gradientId}" x1="${fill.x1}" y1="${fill.y1}" x2="${fill.x2}" y2="${fill.y2}">${stops}</linearGradient>`;
      return { attr: `url(#${gradientId})`, def };
    }
    // Unit vector at `angle` degrees (0 = left-to-right), centered in objectBoundingBox
    // space so it spans the layer's own bounding box regardless of its size.
    const { x1, y1, x2, y2 } = endpointsFromAngle(fill.angle ?? 0);
    const def = `<linearGradient id="${gradientId}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
    return { attr: `url(#${gradientId})`, def };
  }
  if (fill.type === 'radial-gradient') {
    const def = `<radialGradient id="${gradientId}" cx="${fill.cx}" cy="${fill.cy}" r="${fill.r}">${stops}</radialGradient>`;
    return { attr: `url(#${gradientId})`, def };
  }
  return { attr: '#000000', def: '' };
}

/**
 * Inverse of serializeFill's linear-gradient direction math — given a
 * vector in the same 0.5-centered objectBoundingBox-fraction space (dx, dy
 * relative to the box center), returns the angle in degrees that would
 * reproduce it. Not normalized to 0-360 — atan2's native -180..180 range is
 * fine since angle only ever feeds back into cos/sin.
 * @param {number} dx
 * @param {number} dy
 * @returns {number} angle in degrees
 */
export function angleFromVector(dx, dy) {
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Forward: angle (degrees) -> the linear gradient's x1/y1/x2/y2 endpoint
 * pair in 0.5-centered objectBoundingBox-fraction space — the same math
 * serializeFill's angle branch uses, extracted so Endpoints mode can seed
 * itself from an Angle-mode value on an explicit mode switch.
 * @param {number} angle degrees
 * @returns {{x1:number,y1:number,x2:number,y2:number}}
 */
export function endpointsFromAngle(angle) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad) * 0.5;
  const dy = Math.sin(rad) * 0.5;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

/**
 * Inverse of endpointsFromAngle — direction-only (drops magnitude), so this
 * is a lossy UI-convenience seed for switching Endpoints -> Angle mode, not
 * a true round-trip: an asymmetric endpoint pair collapses to whichever
 * angle points the same direction.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {number} angle in degrees
 */
export function angleFromEndpoints(x1, y1, x2, y2) {
  return angleFromVector(x2 - x1, y2 - y1);
}

/**
 * @param {object} [stroke] Stroke — { color, width, linecap, linejoin, dashArray? }
 * @returns {string} a leading-space-prefixed attribute fragment, or '' if there's no stroke
 */
export function serializeStroke(stroke) {
  if (!stroke) return '';
  const parts = [`stroke="${escapeAttr(stroke.color)}"`, `stroke-width="${stroke.width}"`];
  if (stroke.linecap) parts.push(`stroke-linecap="${stroke.linecap}"`);
  if (stroke.linejoin) parts.push(`stroke-linejoin="${stroke.linejoin}"`);
  if (stroke.dashArray && stroke.dashArray.length) parts.push(`stroke-dasharray="${stroke.dashArray.join(',')}"`);
  return ' ' + parts.join(' ');
}
