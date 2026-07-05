// Turns a free-form user label (a layer name, a glyph name for icon-font
// CSS in Phase 4, ...) into a lowercase, hyphenated identifier safe to use
// as a CSS class/id or a CSS custom-ident without escaping — letters,
// digits, and hyphens only, never starting or ending with a hyphen.

/**
 * @param {string} text
 * @returns {string} may be '' if `text` had no slug-safe characters at all — callers should fall back to something non-empty
 */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
