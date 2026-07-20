// The glyph-set JSON manifest: a font-level meta block plus one entry per
// glyph carrying its stable codepoint key and full grid-unit metrics —
// the data shape Glyphrogue's tileset pipeline needs to calibrate a
// Pixelyph glyph set as a font source (see glyphrogue/docs/design/
// fonts-and-tilesets.md's "Pixelyph glyph-set import path" section,
// points A-C). Generated independently of the icon-font CSS (point D) —
// callers that only want font files plus this manifest, with no CSS at
// all, don't need to touch iconFontCss.js.
//
// Keyed by codepoint (hex, lowercase, no padding) rather than slug: slugs
// are regenerated and collision-suffixed on every export
// (assignGlyphSlugs), so they can silently shift across re-exports of an
// edited glyph set — codepoint is the one value that stays stable, so a
// downstream consumer can survive a re-export by referencing it instead.

import { assignGlyphSlugs } from './glyphSlugs.js';
import { glyphMetrics } from '../../model/GlyphSet.js';

const META_KEYS = ['familyName', 'styleName', 'pixelsPerEm', 'unitsPerEm', 'ascender', 'descender', 'baselineRow', 'horizontalPadding'];

/**
 * @param {object} glyphSet GlyphSet
 * @returns {{meta: object, glyphs: Record<string, object>}}
 */
export function generateGlyphManifest(glyphSet) {
  const meta = {};
  for (const key of META_KEYS) meta[key] = glyphSet.meta[key];

  const slugs = assignGlyphSlugs(glyphSet);
  const glyphs = {};
  const sortedEntries = Array.from(glyphSet.glyphs.entries()).sort((a, b) => a[0] - b[0]);
  for (const [codepoint, glyph] of sortedEntries) {
    const hex = codepoint.toString(16);
    const { offsetX, advanceWidth } = glyphMetrics(glyphSet.meta, codepoint, glyph);
    glyphs[hex] = {
      codepoint: hex,
      slug: slugs.get(codepoint),
      name: glyph.name ?? '',
      advanceWidth,
      offsetX,
      width: glyph.width,
      height: glyph.height,
    };
  }

  return { meta, glyphs };
}
