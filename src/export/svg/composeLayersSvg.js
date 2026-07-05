// Composes every visible layer into one SVG string: one pixelloom
// gridToPath call per layer, each wrapped in a <g transform="translate(...)">
// for its offset in canvas space — pixelloom itself never sees offsets.
//
// Phase 1 scope is solid fill only, matching simple tier's data (every
// auto-managed layer's style.fill is a plain color string). Gradient
// fills, stroke, and effects are LayerStyle fields Phase 2 introduces;
// this file grows to handle them then rather than branching now for data
// that can't occur yet.

import { gridToPath } from 'pixelloom';

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * @param {object} canvas Canvas
 * @returns {string}
 */
export function composeLayersSvg(canvas) {
  const body = canvas.layers
    .filter((layer) => layer.visible)
    .map((layer) => {
      const frame = layer.frames[0];
      const d = gridToPath(frame.pixels, layer.width, layer.height);
      if (!d) return '';
      const fill = typeof layer.style.fill === 'string' ? layer.style.fill : '#000000';
      const opacityAttr = layer.opacity === 1 ? '' : ` opacity="${layer.opacity}"`;
      return `<g transform="translate(${layer.offset.x},${layer.offset.y})"${opacityAttr}><path d="${d}" fill-rule="evenodd" fill="${escapeAttr(fill)}"/></g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}">${body}</svg>`;
}
