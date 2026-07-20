// Shared CSS-class-name slug assignment for a glyph set, used by both
// iconFontCss.js (class names) and glyphManifest.js (a metadata field on
// each entry) — factored out so the two stay in agreement on which glyph
// gets which slug regardless of which export(s) a given call actually
// requests (see fonts-and-tilesets.md's point C: slug is glyph-level
// metadata for the CSS class name, codepoint is the manifest's stable key).

import { slugify } from '../slugify.js';

function uniqueSlugFactory() {
  const used = new Set();
  // Falls back to the glyph's own hex codepoint (not a generic 'icon')
  // when the name is empty or entirely unslugifiable, so bulk-generated
  // CSS classes stay distinguishable from each other.
  return (name, codepoint) => {
    const base = slugify(name ?? '') || codepoint.toString(16);
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) candidate = `${base}-${n++}`;
    used.add(candidate);
    return candidate;
  };
}

/**
 * @param {object} glyphSet GlyphSet
 * @returns {Map<number, string>} codepoint -> slug, assigned in ascending-codepoint order
 */
export function assignGlyphSlugs(glyphSet) {
  const nextSlug = uniqueSlugFactory();
  const slugs = new Map();
  const sortedEntries = Array.from(glyphSet.glyphs.entries()).sort((a, b) => a[0] - b[0]);
  for (const [codepoint, glyph] of sortedEntries) {
    slugs.set(codepoint, nextSlug(glyph.name, codepoint));
  }
  return slugs;
}
