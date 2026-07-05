// Glyph export: unlike Draw mode's composeLayersSvg (which composites
// multiple styled layers into one SVG), a glyph is a single unstyled
// boolean grid, so it bypasses that pipeline entirely and calls pixelloom's
// own gridToSvg directly (see the plan's SVG export pipeline section) —
// the same call GlyphSetPanel's thumbnails and the specimen preview reuse.

import { gridToSvg } from 'pixelloom';

/**
 * @param {object} glyph Glyph
 * @param {{fill?: string}} [options]
 * @returns {string} a standalone `<svg>...</svg>` string
 */
export function glyphToSvg(glyph, { fill = '#000000' } = {}) {
  return gridToSvg(glyph.pixels, glyph.width, glyph.height, { fill });
}
