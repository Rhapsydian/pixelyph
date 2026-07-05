// `.pixelyph` project file: a single JSON file, human-inspectable and
// diffable. Typed-array pixel grids are base64-encoded rather than emitted
// as JSON arrays of 0/1 — much smaller on disk and avoids pathological
// JSON bloat on larger canvases. Pure data in/out — no DOM/Electron API,
// same code runs in the web build and the Electron build.

export const PIXELYPH_VERSION = 1;

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function serializeLayer(layer) {
  return {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    offset: layer.offset,
    width: layer.width,
    height: layer.height,
    style: layer.style,
    frames: layer.frames.map((frame) => ({ pixels: bytesToBase64(frame.pixels) })),
    ...(layer.autoManaged !== undefined ? { autoManaged: layer.autoManaged } : {}),
    ...(layer.autoColor !== undefined ? { autoColor: layer.autoColor } : {}),
  };
}

function deserializeLayer(layer) {
  return {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    offset: layer.offset,
    width: layer.width,
    height: layer.height,
    style: layer.style,
    frames: layer.frames.map((frame) => ({ pixels: base64ToBytes(frame.pixels) })),
    ...(layer.autoManaged !== undefined ? { autoManaged: layer.autoManaged } : {}),
    ...(layer.autoColor !== undefined ? { autoColor: layer.autoColor } : {}),
  };
}

/**
 * @param {object} canvas Canvas
 * @returns {object} a JSON-safe `.pixelyph` document (kind: 'draw')
 */
export function serializeProject(canvas) {
  return {
    pixelyphVersion: PIXELYPH_VERSION,
    kind: 'draw',
    canvas: {
      id: canvas.id,
      width: canvas.width,
      height: canvas.height,
      tier: canvas.tier,
      palette: canvas.palette,
      symmetryMode: canvas.symmetryMode,
      referenceImage: canvas.referenceImage ?? null,
      activeLayerId: canvas.activeLayerId ?? null,
      simpleTier: { colorToLayerId: Array.from(canvas.simpleTier.colorToLayerId.entries()) },
      layers: canvas.layers.map(serializeLayer),
    },
  };
}

/**
 * @param {object} doc a parsed `.pixelyph` document
 * @returns {object} Canvas
 */
export function deserializeProject(doc) {
  if (doc.kind !== 'draw') throw new Error(`deserializeProject: expected kind 'draw', got '${doc.kind}'`);
  const c = doc.canvas;
  return {
    id: c.id,
    width: c.width,
    height: c.height,
    tier: c.tier,
    palette: c.palette,
    symmetryMode: c.symmetryMode,
    referenceImage: c.referenceImage ?? undefined,
    activeLayerId: c.activeLayerId ?? null,
    simpleTier: { colorToLayerId: new Map(c.simpleTier.colorToLayerId) },
    layers: c.layers.map(deserializeLayer),
  };
}

/** @returns {string} pretty-printed JSON, ready to write to a `.pixelyph` file */
export function saveProjectToString(canvas) {
  return JSON.stringify(serializeProject(canvas), null, 2);
}

/** @returns {object} Canvas, reconstructed from a `.pixelyph` file's contents */
export function loadProjectFromString(text) {
  return deserializeProject(JSON.parse(text));
}

function serializeGlyph(glyph) {
  return {
    width: glyph.width,
    height: glyph.height,
    pixels: bytesToBase64(glyph.pixels),
    advanceWidth: glyph.advanceWidth,
    leftSideBearing: glyph.leftSideBearing,
    name: glyph.name,
  };
}

function deserializeGlyph(glyph) {
  return {
    width: glyph.width,
    height: glyph.height,
    pixels: base64ToBytes(glyph.pixels),
    advanceWidth: glyph.advanceWidth,
    leftSideBearing: glyph.leftSideBearing,
    name: glyph.name,
  };
}

/**
 * @param {object} glyphSet GlyphSet
 * @returns {object} a JSON-safe `.pixelyph` document (kind: 'glyph')
 */
export function serializeGlyphSetProject(glyphSet) {
  return {
    pixelyphVersion: PIXELYPH_VERSION,
    kind: 'glyph',
    glyphSet: {
      id: glyphSet.id,
      kind: glyphSet.kind,
      meta: glyphSet.meta,
      glyphs: Array.from(glyphSet.glyphs.entries()).map(([codepoint, glyph]) => [codepoint, serializeGlyph(glyph)]),
    },
  };
}

/**
 * @param {object} doc a parsed `.pixelyph` document
 * @returns {object} GlyphSet
 */
export function deserializeGlyphSetProject(doc) {
  if (doc.kind !== 'glyph') throw new Error(`deserializeGlyphSetProject: expected kind 'glyph', got '${doc.kind}'`);
  const gs = doc.glyphSet;
  return {
    id: gs.id,
    kind: gs.kind,
    meta: gs.meta,
    glyphs: new Map(gs.glyphs.map(([codepoint, glyph]) => [codepoint, deserializeGlyph(glyph)])),
  };
}

/** @returns {string} pretty-printed JSON, ready to write to a `.pixelyph` file */
export function saveGlyphProjectToString(glyphSet) {
  return JSON.stringify(serializeGlyphSetProject(glyphSet), null, 2);
}

/** @returns {object} GlyphSet, reconstructed from a `.pixelyph` file's contents */
export function loadGlyphProjectFromString(text) {
  return deserializeGlyphSetProject(JSON.parse(text));
}
