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
    // Unit vector at `angle` degrees (0 = left-to-right), centered in objectBoundingBox
    // space so it spans the layer's own bounding box regardless of its size.
    const rad = ((fill.angle ?? 0) * Math.PI) / 180;
    const dx = Math.cos(rad) * 0.5;
    const dy = Math.sin(rad) * 0.5;
    const def = `<linearGradient id="${gradientId}" x1="${0.5 - dx}" y1="${0.5 - dy}" x2="${0.5 + dx}" y2="${0.5 + dy}">${stops}</linearGradient>`;
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
