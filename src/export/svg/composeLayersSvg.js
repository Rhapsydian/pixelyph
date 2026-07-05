// Composes every visible layer into one SVG string: one pixelloom
// gridToPath call per layer, each wrapped in a <g transform="translate(...)">
// for its offset in canvas space — pixelloom itself never sees offsets.
// Per-layer gradient/filter defs are collected into one shared <defs>
// block, ids namespaced per layer (`grad-${id}`/`filter-${id}`) to avoid
// collisions between layers.
//
// Each <g> also gets a CSS-selectable id derived from the layer's *name*
// (not its internal id), on by default rather than a per-layer opt-in —
// most layers get meaningful names anyway, and it matches the slugification
// iconFontCss.js will need for glyph names in Phase 4. Two layers sharing a
// name still get distinct ids (`-2`, `-3`, ...) so nothing silently
// collides in the exported markup.
//
// composeLayersBody is exported separately (not just composeLayersSvg) so
// SvgPixelEditor can inject the identical markup — body and defs strings,
// no <svg> wrapper — into the live editing surface via
// dangerouslySetInnerHTML. That's what makes "the editing surface is the
// exported artifact" (see the plan's "Editor rendering surface" section) a
// structural guarantee rather than two implementations kept in sync by hand.

import { gridToPath } from 'pixelloom';
import { escapeAttr, serializeFill, serializeStroke } from './layerStyle.js';
import { buildFilterDef } from './filters.js';
import { slugify } from '../slugify.js';

/** @returns {string} a `layer-...` id, unique within this call — first-come gets the bare slug, later duplicates get `-2`, `-3`, ... */
function uniqueLayerElementId(name, usedIds) {
  const base = `layer-${slugify(name) || 'unnamed'}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix++;
  }
  usedIds.add(id);
  return id;
}

/**
 * @param {object} canvas Canvas
 * @returns {{ body: string, defs: string[] }}
 */
export function composeLayersBody(canvas) {
  const defs = [];
  const usedIds = new Set();
  const body = canvas.layers
    .filter((layer) => layer.visible)
    .map((layer) => {
      const frame = layer.frames[0];
      const d = gridToPath(frame.pixels, layer.width, layer.height);
      if (!d) return '';
      const elementId = uniqueLayerElementId(layer.name, usedIds);
      const fill = serializeFill(layer.style.fill, `grad-${layer.id}`);
      if (fill.def) defs.push(fill.def);
      const strokeAttr = serializeStroke(layer.style.stroke);
      const filterDef = buildFilterDef(layer.style.effects, `filter-${layer.id}`);
      if (filterDef) defs.push(filterDef);
      const filterAttr = filterDef ? ` filter="url(#filter-${layer.id})"` : '';
      const opacityAttr = layer.opacity === 1 ? '' : ` opacity="${layer.opacity}"`;
      return `<g id="${elementId}" transform="translate(${layer.offset.x},${layer.offset.y})"${opacityAttr}><path d="${d}" fill-rule="evenodd" fill="${escapeAttr(fill.attr)}"${strokeAttr}${filterAttr}/></g>`;
    })
    .join('');
  return { body, defs };
}

/**
 * @param {object} canvas Canvas
 * @returns {string}
 */
export function composeLayersSvg(canvas) {
  const { body, defs } = composeLayersBody(canvas);
  const defsBlock = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}">${defsBlock}${body}</svg>`;
}
