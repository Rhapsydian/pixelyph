// Icon-font-specific export: a @font-face + one `.icon-{name}::before`
// rule per glyph, plus a JSON manifest ({ "star": "e001", ... }) for
// programmatic consumption — the IcoMoon/Fontello convention. `src` points
// at sibling .woff2/.woff files (this is a plain, hostable CSS file, unlike
// demoHtml.js's fully self-contained base64-embedded specimen).
//
// Glyph `name` is a free-form user label, so it needs slugifying before
// it's safe to emit as a CSS class name — that conversion lives here, not
// on the Glyph model itself.

import { slugify } from '../slugify.js';

function uniqueSlugFactory() {
  const used = new Set();
  return (name) => {
    const base = slugify(name ?? '') || 'icon';
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) candidate = `${base}-${n++}`;
    used.add(candidate);
    return candidate;
  };
}

/**
 * @param {object} glyphSet GlyphSet (icon-kind)
 * @returns {{css: string, manifest: Record<string, string>}} manifest maps each icon's slug to its codepoint in lowercase hex
 */
export function generateIconFontCss(glyphSet) {
  const { familyName } = glyphSet.meta;
  const fontFileBase = slugify(familyName) || 'icon-font';
  const nextSlug = uniqueSlugFactory();
  const manifest = {};
  const rules = [];

  const sortedEntries = Array.from(glyphSet.glyphs.entries()).sort((a, b) => a[0] - b[0]);
  for (const [codepoint, glyph] of sortedEntries) {
    const slug = nextSlug(glyph.name);
    const hex = codepoint.toString(16);
    manifest[slug] = hex;
    rules.push(`.icon-${slug}::before {\n  content: "\\${hex}";\n}`);
  }

  const css = [
    '@font-face {',
    `  font-family: "${familyName}";`,
    `  src: url("${fontFileBase}.woff2") format("woff2"),`,
    `       url("${fontFileBase}.woff") format("woff");`,
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

  return { css, manifest };
}
