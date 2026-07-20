// Icon-font-specific export: a @font-face + one `.icon-{name}::before`
// rule per glyph — the IcoMoon/Fontello CSS convention. `src` points at
// sibling font files (this is a plain, hostable CSS file, unlike
// demoHtml.js's fully self-contained base64-embedded specimen) — so the
// `formats` option must match whichever binary format(s) the caller is
// actually exporting alongside this CSS. Referencing a format that wasn't
// also exported produces CSS that can't ever load the font (found via
// manual icon-font testing: FontExportPanel lets CSS be checked
// independently of OTF/WOFF, and this used to hardcode woff2/woff
// regardless of what was actually selected).
//
// The JSON manifest used to be generated here too, but moved to its own
// glyphManifest.js — Glyphrogue needs the manifest regardless of whether
// this CSS is also being exported (see glyphManifest.js's header), so the
// two are independently callable. Slug assignment (glyph `name` is a
// free-form user label, so it needs slugifying before it's safe to emit
// as a CSS class name) is shared via glyphSlugs.js so both stay in
// agreement on which glyph gets which slug.

import { slugify } from '../slugify.js';
import { assignGlyphSlugs } from './glyphSlugs.js';

// Priority order for the @font-face `src` list — browsers use the first
// source they can load, so list the most efficient formats first.
const FORMAT_SOURCES = [
  ['woff2', (base) => `url("${base}.woff2") format("woff2")`],
  ['woff', (base) => `url("${base}.woff") format("woff")`],
  ['otf', (base) => `url("${base}.otf") format("opentype")`],
];

/**
 * @param {object} glyphSet GlyphSet
 * @param {{formats?: {woff2?: boolean, woff?: boolean, otf?: boolean}}} [options]
 *   which sibling font file(s) will actually be exported alongside this
 *   CSS — only those appear in the `src` list. Defaults to `{otf: true}`,
 *   since a compiled OTF always exists whenever this is called from the
 *   normal export flow.
 * @returns {{css: string}}
 */
export function generateIconFontCss(glyphSet, { formats = { otf: true } } = {}) {
  const { familyName } = glyphSet.meta;
  const fontFileBase = slugify(familyName) || 'icon-font';
  const slugs = assignGlyphSlugs(glyphSet);
  const rules = [];

  const sortedEntries = Array.from(glyphSet.glyphs.entries()).sort((a, b) => a[0] - b[0]);
  for (const [codepoint] of sortedEntries) {
    const slug = slugs.get(codepoint);
    const hex = codepoint.toString(16);
    rules.push(`.icon-${slug}::before {\n  content: "\\${hex}";\n}`);
  }

  const sources = FORMAT_SOURCES.filter(([key]) => formats[key]).map(([, toSource]) => toSource(fontFileBase));
  const srcLine = sources.length > 0 ? `  src: ${sources.join(',\n       ')};` : '  /* no font file was selected alongside this CSS — src intentionally omitted */';

  const css = [
    '@font-face {',
    `  font-family: "${familyName}";`,
    srcLine,
    '  font-weight: normal;',
    '  font-style: normal;',
    '}',
    '',
    '[class^="icon-"], [class*=" icon-"] {',
    `  font-family: "${familyName}";`,
    '  font-style: normal;',
    '  font-weight: normal;',
    '  display: inline-block;',
    '}',
    '',
    ...rules,
  ].join('\n');

  return { css };
}
