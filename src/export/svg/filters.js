// Builds a per-layer <filter> def from a Layer's `style.effects`
// (drop-shadow, blur — "glow" is a UI-level drop-shadow preset, not a
// separate primitive here; see the plan's v1-scope note). Shared verbatim
// between composeLayersSvg.js and SvgPixelEditor.jsx, like layerStyle.js.

import { escapeAttr } from './layerStyle.js';

/**
 * @param {object[]} effects EffectSpec[]
 * @param {string} filterId a per-layer id, so multiple layers' filters don't collide in one shared <defs>
 * @returns {string} a <filter> def, or '' if there are no effects
 */
export function buildFilterDef(effects, filterId) {
  if (!effects || effects.length === 0) return '';
  // Primitives chain implicitly (each omits `in`, defaulting to the previous
  // primitive's result), so no need to track explicit result ids.
  const primitives = effects
    .map((effect) => {
      if (effect.type === 'drop-shadow') {
        const opacity = effect.opacity ?? 1;
        return `<feDropShadow dx="${effect.dx}" dy="${effect.dy}" stdDeviation="${effect.blur}" flood-color="${escapeAttr(effect.color)}" flood-opacity="${opacity}"/>`;
      }
      if (effect.type === 'blur') {
        return `<feGaussianBlur stdDeviation="${effect.stdDeviation}"/>`;
      }
      return '';
    })
    .join('');
  // Expanded filter region (default is -10%/-10%/120%/120%) so shadow
  // offset/blur radius aren't clipped at a pixel-art-sized layer's edges.
  return `<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">${primitives}</filter>`;
}
