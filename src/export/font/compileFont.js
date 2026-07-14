// Builds one opentype.Glyph per codepoint (plus an auto-generated .notdef)
// and one opentype.Font from a GlyphSet. Exports as OTF (CFF-flavored
// OpenType) — the only format opentype.js can actually produce when
// building a font from scratch (see gridToGlyphPath.js); WOFF/WOFF2 are
// derived from this compiled buffer afterward (see woff.js).
//
// Auto-assigned (Private Use Area) codepoints use the seamless-tiling
// formula for spacing (leftSideBearing = horizontalPadding, advanceWidth =
// width + 2*padding, both in grid units before scaling); real typed
// codepoints use each Glyph's own stored advanceWidth/leftSideBearing, with
// horizontalPadding added on top the same way (both authored in grid units,
// like `width`, and scaled here along with everything else) — see
// GlyphSet.js's glyphMetrics, shared with the Specimen Preview panel so
// both agree on spacing exactly.

import { gridToGlyphPath } from './gridToGlyphPath.js';
import { slugify } from '../slugify.js';
import { opentype } from './opentypeCompat.js';
import { glyphMetrics } from '../../model/GlyphSet.js';

const NOTDEF_ADVANCE_FRACTION = 0.5; // of unitsPerEm
const NOTDEF_INSET_FRACTION = 0.15; // of the notdef box's own advance width

function buildNotdefGlyph(meta) {
  const advanceWidth = Math.round(meta.unitsPerEm * NOTDEF_ADVANCE_FRACTION);
  const inset = Math.round(advanceWidth * NOTDEF_INSET_FRACTION);
  const path = new opentype.Path();
  path.moveTo(inset, 0);
  path.lineTo(advanceWidth - inset, 0);
  path.lineTo(advanceWidth - inset, meta.ascender);
  path.lineTo(inset, meta.ascender);
  path.close();
  return new opentype.Glyph({ name: '.notdef', advanceWidth, path });
}

function uniqueNameFactory() {
  const used = new Set(['.notdef']);
  return (base) => {
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) candidate = `${base}-${n++}`;
    used.add(candidate);
    return candidate;
  };
}

// Naming branches on glyph.name presence, not codepoint origin — a glyph
// keeps a user-entered name distinguishable in the compiled font's glyph
// table regardless of whether it also has a real assigned character.
function glyphName(codepoint, glyph) {
  const hex = `uni${codepoint.toString(16).toUpperCase().padStart(4, '0')}`;
  const slug = slugify(glyph.name ?? '');
  return slug ? `icon-${slug}` : hex;
}

/**
 * @param {object} glyphSet GlyphSet
 * @returns {opentype.Font}
 */
export function compileFont(glyphSet) {
  const { meta } = glyphSet;
  const scale = meta.unitsPerEm / meta.pixelsPerEm;
  const makeUniqueName = uniqueNameFactory();
  const glyphs = [buildNotdefGlyph(meta)];

  const sortedEntries = Array.from(glyphSet.glyphs.entries()).sort((a, b) => a[0] - b[0]);
  for (const [codepoint, glyph] of sortedEntries) {
    const raw = glyphMetrics(meta, codepoint, glyph);
    const offsetX = raw.offsetX * scale;
    const advanceWidth = raw.advanceWidth * scale;
    const path = gridToGlyphPath(glyph, { scale, baselineRow: meta.baselineRow, offsetX });
    glyphs.push(
      new opentype.Glyph({
        name: makeUniqueName(glyphName(codepoint, glyph)),
        unicode: codepoint,
        advanceWidth,
        leftSideBearing: offsetX,
        path,
      }),
    );
  }

  return new opentype.Font({
    familyName: meta.familyName,
    styleName: meta.styleName,
    unitsPerEm: meta.unitsPerEm,
    ascender: meta.ascender,
    descender: meta.descender,
    glyphs,
  });
}

/**
 * @param {opentype.Font} font
 * @returns {ArrayBuffer} the compiled OTF's raw bytes
 */
export function fontToArrayBuffer(font) {
  return font.toArrayBuffer();
}
