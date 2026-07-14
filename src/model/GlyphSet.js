// Glyph mode's document. Much simpler data model than Draw mode's Canvas:
// one boolean grid per glyph (no color, no layers, no style) keyed by
// Unicode codepoint. Every glyph can freely have a real typed character
// (as its Map key), a free-form name, both, or neither — there is no
// project-level lock between "character" and "icon" glyphs. A glyph with
// no typed character gets an auto-assigned Private Use Area codepoint (see
// nextAutoCodepoint/isAutoAssignedCodepoint) purely as an internal slot the
// user never types.
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
import { resize as resizeGrid, flipPixelsH, flipPixelsV, rotatePixels90 } from './Grid.js';

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
 * @param {{meta?: object}} options
 * @returns {object} GlyphSet
 */
export function createGlyphSet({ meta } = {}) {
  return {
    id: makeId(),
    meta: createFontMeta(meta),
    glyphs: new Map(),
  };
}

/**
 * @param {{width: number, height: number, advanceWidth?: number, leftSideBearing?: number, name?: string}} options
 * @returns {object} Glyph
 */
export function createGlyph({ width, height, advanceWidth, leftSideBearing = 0, name = '' }) {
  return {
    width,
    height,
    pixels: new Uint8Array(width * height),
    advanceWidth: advanceWidth ?? width,
    leftSideBearing,
    name,
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

const PUA_START = 0xe000;
const PUA_END = 0xf8ff;

/**
 * The smallest unused codepoint >= U+E000 (start of the Private Use Area),
 * computed fresh from the current glyph set rather than tracked as a
 * separate counter — auto-assigned codepoints are never user-facing, so
 * there's nothing to keep in sync if a glyph is later removed.
 *
 * @returns {number}
 */
export function nextAutoCodepoint(glyphSet) {
  let cp = PUA_START;
  while (glyphSet.glyphs.has(cp)) cp++;
  return cp;
}

/** @returns {boolean} whether `codepoint` sits in the Private Use Area — i.e. was auto-assigned rather than a real typed/pasted character. */
export function isAutoAssignedCodepoint(codepoint) {
  return codepoint >= PUA_START && codepoint <= PUA_END;
}

/**
 * One glyph's horizontal metrics, in the same grid units as `meta`/`glyph`
 * (before any unitsPerEm scaling — callers scale both fields by their own
 * scale factor). Auto-assigned codepoints use the seamless-tiling formula
 * (bearing = iconTilePadding, advance = width + 2*padding); real typed
 * codepoints use the glyph's own stored bearing/advance. Shared by
 * compileFont.js (actual export) and SpecimenPreviewPanel.jsx (preview
 * layout) so both agree on spacing exactly.
 *
 * @returns {{offsetX: number, advanceWidth: number}}
 */
export function glyphMetrics(meta, codepoint, glyph) {
  if (isAutoAssignedCodepoint(codepoint)) {
    const padding = meta.iconTilePadding ?? 0;
    return { offsetX: padding, advanceWidth: glyph.width + 2 * padding };
  }
  return { offsetX: glyph.leftSideBearing ?? 0, advanceWidth: glyph.advanceWidth ?? glyph.width };
}

const NON_DISPLAYABLE_LABELS = {
  0x20: 'Space',
  0x09: 'Tab',
  0x0a: 'Line Feed',
  0x0d: 'Carriage Return',
};

/** @returns {boolean} false for C0/C1 control characters and whitespace/separator characters; true otherwise. Drives label fallback logic in the glyph panel. */
export function isDisplayableChar(codepoint) {
  if (codepoint <= 0x1f) return false; // C0 controls (includes tab, LF, CR)
  if (codepoint === 0x20) return false; // space
  if (codepoint === 0x7f) return false; // DEL
  if (codepoint >= 0x80 && codepoint <= 0x9f) return false; // C1 controls
  return true;
}

/** @returns {string|null} a human label for a common non-displayable codepoint (e.g. 'Space', 'Tab'), or null if none is known. */
export function nonDisplayableLabel(codepoint) {
  return NON_DISPLAYABLE_LABELS[codepoint] ?? null;
}

function isPixelBufferEmpty(pixels) {
  if (!pixels) return true;
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i]) return false;
  }
  return true;
}

/** @returns {boolean} true iff every pixel in every present buffer (base, and background/foreground if added) is unset. */
export function isEmptyGlyph(glyph) {
  return isPixelBufferEmpty(glyph.pixels)
    && isPixelBufferEmpty(glyph.backgroundPixels)
    && isPixelBufferEmpty(glyph.foregroundPixels);
}

/** Adds a blank optional background layer (same size as the base glyph), behind/underneath it. Model-only — no UI or export reads this yet. */
export function addBackgroundLayer(glyph) {
  glyph.backgroundPixels = new Uint8Array(glyph.width * glyph.height);
}

/** Removes the optional background layer, if present. */
export function removeBackgroundLayer(glyph) {
  delete glyph.backgroundPixels;
}

/** Adds a blank optional foreground layer (same size as the base glyph), on top of/overlaid on it. Model-only — no UI or export reads this yet. */
export function addForegroundLayer(glyph) {
  glyph.foregroundPixels = new Uint8Array(glyph.width * glyph.height);
}

/** Removes the optional foreground layer, if present. */
export function removeForegroundLayer(glyph) {
  delete glyph.foregroundPixels;
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

/** Mirrors one glyph's own pixel buffer horizontally, in place — width/height unchanged, no re-crop needed. */
export function flipGlyphH(glyph) {
  glyph.pixels = flipPixelsH(glyph.width, glyph.height, glyph.pixels);
}

/** @see flipGlyphH */
export function flipGlyphV(glyph) {
  glyph.pixels = flipPixelsV(glyph.width, glyph.height, glyph.pixels);
}

/**
 * Rotates one glyph's own pixel buffer 90° clockwise (width/height swap),
 * then re-crops/pads it back to the font's shared pixelsPerEm height via
 * the same Grid.resize primitive resizeGlyphSet uses — lossy only when the
 * rotated height doesn't already match pixelsPerEm (i.e. the glyph wasn't
 * itself pixelsPerEm-wide before rotating). Callers should confirm first
 * when that's the case, same as resizeGlyphSet/the tier-collapse convert.
 *
 * @param {object} glyphSet
 * @param {object} glyph
 */
export function rotateGlyph90(glyphSet, glyph) {
  const rotated = rotatePixels90(glyph.width, glyph.height, glyph.pixels);
  glyph.width = rotated.width;
  glyph.height = rotated.height;
  glyph.pixels = rotated.pixels;
  const pixelsPerEm = glyphSet.meta.pixelsPerEm;
  if (glyph.height !== pixelsPerEm) {
    glyph.pixels = resizeGrid(glyph, glyph.width, pixelsPerEm).pixels;
    glyph.height = pixelsPerEm;
  }
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
