// Glyph mode's document. Much simpler data model than Draw mode's Canvas:
// one boolean grid per glyph (no color, no layers, no style) keyed by
// Unicode codepoint. Character-kind sets map codepoints to real characters
// (via CharacterMapPanel); icon-kind sets use codepoints purely as internal
// Private Use Area slots the user never types (see nextIconCodepoint).
//
// Editing reuses Draw mode's Canvas/Layer/autoLayerSync machinery rather
// than a separate paint path: glyphToCanvas wraps one glyph as a
// single-color, single-layer 'simple'-tier Canvas (palette ['#000000']),
// so the exact same SvgPixelEditor/tools/paintCell code that already
// exists for Draw mode edits it — "layers/style/effects turned off" falls
// out for free from there only ever being at most one Grid (Shape) in that
// one layer's one frame. canvasToGlyphPixels reads the result back out once
// a stroke commits; see state/store.js's glyph-mode commit path.

import { createCanvas, paintCell as paintCanvasCell } from './Canvas.js';
import { resize as resizeGrid } from './Grid.js';

const GLYPH_FILL = '#000000';

let nextId = 1;
function makeId() {
  return `glyphset-${nextId++}`;
}

/**
 * @param {Partial<{familyName:string, styleName:string, unitsPerEm:number, ascender:number,
 *   descender:number, pixelsPerEm:number, baselineRow:number, iconTilePadding:number}>} [overrides]
 * @returns {object} FontMeta
 */
export function createFontMeta(overrides = {}) {
  return {
    familyName: 'My Font',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    pixelsPerEm: 16,
    baselineRow: 12,
    iconTilePadding: 0,
    // null = derive from pixelsPerEm at glyph-creation time (see store.js's
    // assignCodepoint/addIconGlyph). Non-null overrides that derivation.
    defaultGlyphWidth: null,
    ...overrides,
  };
}

/**
 * @param {{kind: 'characters'|'icons', meta?: object}} options
 * @returns {object} GlyphSet
 */
export function createGlyphSet({ kind, meta } = {}) {
  return {
    id: makeId(),
    kind: kind ?? 'characters',
    meta: createFontMeta(meta),
    glyphs: new Map(),
  };
}

/**
 * @param {{width: number, height: number, advanceWidth?: number, leftSideBearing?: number, name?: string}} options
 * @returns {object} Glyph
 */
export function createGlyph({ width, height, advanceWidth, leftSideBearing = 0, name = '', unicode = null }) {
  return {
    width,
    height,
    pixels: new Uint8Array(width * height),
    advanceWidth: advanceWidth ?? width,
    leftSideBearing,
    name,
    unicode,
  };
}

/** @returns {object|null} the Glyph at `codepoint`, or null if unassigned. */
export function getGlyph(glyphSet, codepoint) {
  return glyphSet.glyphs.get(codepoint) ?? null;
}

export function setGlyph(glyphSet, codepoint, glyph) {
  glyphSet.glyphs.set(codepoint, glyph);
}

export function removeGlyph(glyphSet, codepoint) {
  glyphSet.glyphs.delete(codepoint);
}

/** @returns {boolean} whether assigning `codepoint` would replace an existing glyph — the pure check backing the "confirm before replacing" prompt (the confirm dialog itself is UI, not modeled here). */
export function wouldCollide(glyphSet, codepoint) {
  return glyphSet.glyphs.has(codepoint);
}

/**
 * The smallest unused codepoint >= U+E000 (start of the Private Use Area),
 * computed fresh from the current glyph set rather than tracked as a
 * separate counter — icon-kind sets never expose codepoints to the user, so
 * there's nothing to keep in sync if a glyph is later removed.
 *
 * @returns {number}
 */
export function nextIconCodepoint(glyphSet) {
  let cp = 0xe000;
  while (glyphSet.glyphs.has(cp)) cp++;
  return cp;
}

/**
 * Applies a new `pixelsPerEm` (glyph grid height, uniform across the whole
 * font) by cropping or padding every existing glyph's grid via the same
 * Grid.resize primitive Canvas.resize/Layer.growToInclude are built from.
 * Glyph *width* is per-glyph and untouched. Potentially lossy (can crop off
 * already-drawn pixels) — callers should confirm first, same as the
 * simple/advanced tier toggle and codepoint-reuse cases in Draw mode.
 *
 * @param {object} glyphSet
 * @param {number} newPixelsPerEm
 * @param {string} [anchor]
 */
export function resizeGlyphSet(glyphSet, newPixelsPerEm, anchor = 'top-left') {
  for (const glyph of glyphSet.glyphs.values()) {
    glyph.pixels = resizeGrid(glyph, glyph.width, newPixelsPerEm, anchor).pixels;
    glyph.height = newPixelsPerEm;
  }
  glyphSet.meta.pixelsPerEm = newPixelsPerEm;
}

/**
 * Wraps one Glyph as a single-color, single-layer 'simple'-tier Canvas, so
 * Draw mode's existing paintCell/autoLayerSync/composeLayersBody/
 * SvgPixelEditor can edit and render it unchanged. The layer's pixel buffer
 * is a copy, not a live reference — commitStroke reads the result back out
 * via canvasToGlyphPixels rather than relying on reference identity, since
 * autoLayerSync can freely discard/recreate the auto layer (e.g. on full
 * erase then repaint) with a brand new Uint8Array.
 *
 * @param {object} glyph
 * @returns {object} Canvas
 */
export function glyphToCanvas(glyph) {
  const canvas = createCanvas({ width: glyph.width, height: glyph.height, palette: [GLYPH_FILL] });
  for (let y = 0; y < glyph.height; y++) {
    for (let x = 0; x < glyph.width; x++) {
      if (glyph.pixels[y * glyph.width + x]) paintCanvasCell(canvas, x, y, GLYPH_FILL);
    }
  }
  return canvas;
}

/**
 * Reads the composited black pixels back out of a glyphToCanvas result — a
 * single-color palette means at most one Grid (Shape) ever exists, in the
 * one layer's one frame, so this is just "that Grid's pixels, or all-zero if
 * painting emptied it out." The Grid is auto-cropped to its own minimal
 * bounding box (see docs/data-model.md), so its buffer has to be expanded
 * back out into a full `canvas.width x canvas.height` array at its own
 * `(offsetX, offsetY)` — the inverse of growGridToInclude.
 *
 * @param {object} canvas
 * @returns {Uint8Array}
 */
export function canvasToGlyphPixels(canvas) {
  const layer = canvas.layers[0];
  const grid = layer?.frames[0]?.grids[0];
  const pixels = new Uint8Array(canvas.width * canvas.height);
  if (!grid) return pixels;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.pixels[y * grid.width + x]) {
        pixels[(grid.offsetY + y) * canvas.width + (grid.offsetX + x)] = 1;
      }
    }
  }
  return pixels;
}
