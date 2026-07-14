// `.pixelyph` project file: a single JSON file, human-inspectable and
// diffable. Typed-array pixel grids are base64-encoded rather than emitted
// as JSON arrays of 0/1 — much smaller on disk and avoids pathological
// JSON bloat on larger canvases. Pure data in/out — no DOM/Electron API,
// same code runs in the web build and the Electron build.

import { normalizePalette } from '../model/Palette.js';
import { resizeAt, minimalBounds, makeGridId } from '../model/Grid.js';
import { cloneLayerStyle } from '../model/Canvas.js';
import { makeId as makeLayerId } from '../model/Layer.js';

// v3 (current): Layer.frames[i] holds `grids: Grid[]` — one or more
// independently-styled, auto-cropped shapes — instead of a single dense
// per-frame pixel buffer with the style/offset living on the Layer itself.
// See docs/data-model.md for the full model and the v1/v2 -> v3 migration
// this file implements below.
export const PIXELYPH_VERSION = 3;

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

// Grid cells are always exactly 0 or 1 (paint mask — color/style lives on
// the Grid, not per cell; see Canvas.js's paintCell/paintSimpleCell), so
// packing 8 cells per byte before base64 shrinks saves ~8x versus spending
// a full byte per cell. Versioned (see PIXELYPH_VERSION) since pre-v2 saves
// have one unpacked byte per cell instead.
function bitsToBase64(pixels) {
  const bytes = new Uint8Array(Math.ceil(pixels.length / 8));
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i]) bytes[i >> 3] |= 1 << (i & 7);
  }
  return bytesToBase64(bytes);
}

function base64ToBits(base64, length) {
  const bytes = base64ToBytes(base64);
  const pixels = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    pixels[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  }
  return pixels;
}

function decodePixels(base64, length, pixelyphVersion) {
  return pixelyphVersion >= 2 ? base64ToBits(base64, length) : base64ToBytes(base64);
}

// --- v3: Grid (Shape) serialization ---

function serializeGrid(grid) {
  return {
    id: grid.id,
    name: grid.name,
    offsetX: grid.offsetX,
    offsetY: grid.offsetY,
    width: grid.width,
    height: grid.height,
    pixels: bitsToBase64(grid.pixels),
    style: grid.style,
    visible: grid.visible,
    locked: grid.locked,
    opacity: grid.opacity,
  };
}

function deserializeGrid(grid, pixelyphVersion) {
  return {
    id: grid.id,
    name: grid.name,
    offsetX: grid.offsetX,
    offsetY: grid.offsetY,
    width: grid.width,
    height: grid.height,
    pixels: decodePixels(grid.pixels, grid.width * grid.height, pixelyphVersion),
    style: grid.style,
    visible: grid.visible,
    locked: grid.locked,
    opacity: grid.opacity,
  };
}

function serializeLayer(layer) {
  return {
    id: layer.id,
    name: layer.name,
    locked: layer.locked,
    opacity: layer.opacity,
    frames: layer.frames.map((frame) => ({
      visible: frame.visible,
      grids: frame.grids.map(serializeGrid),
    })),
  };
}

function deserializeLayerV3(layer, pixelyphVersion) {
  return {
    id: layer.id,
    name: layer.name,
    locked: layer.locked,
    opacity: layer.opacity,
    frames: layer.frames.map((frame) => ({
      visible: frame.visible,
      grids: frame.grids.map((g) => deserializeGrid(g, pixelyphVersion)),
    })),
  };
}

// --- v1/v2 -> v3 migration ---
// Pre-v3 saves have one dense `width x height` pixel buffer per frame, with
// style/offset/width/height living on the Layer rather than per-shape. This
// decodes that legacy shape (reusing the same bit/byte-packing decode as
// today), then converts it into the new Layer/Frame/Grid shape.

function deserializeLegacyLayer(layer, pixelyphVersion) {
  // Pre-per-frame-visibility saves had one `visible` boolean for the whole
  // layer instead of one per frame — used as every frame's initial value
  // when a loaded frame doesn't have its own `visible` field yet.
  const legacyVisible = layer.visible ?? true;
  const length = layer.width * layer.height;
  return {
    id: layer.id,
    name: layer.name,
    locked: layer.locked,
    opacity: layer.opacity,
    offset: layer.offset,
    width: layer.width,
    height: layer.height,
    style: layer.style,
    frames: layer.frames.map((frame) => ({ pixels: decodePixels(frame.pixels, length, pixelyphVersion), visible: frame.visible ?? legacyVisible })),
    ...(layer.autoManaged !== undefined ? { autoManaged: layer.autoManaged } : {}),
    ...(layer.autoColor !== undefined ? { autoColor: layer.autoColor } : {}),
  };
}

/**
 * Converts one legacy (already-decoded) Layer's dense per-frame buffers into
 * the new `{visible, grids}[]` shape — one Grid per non-empty frame, cropped
 * to its minimal bounding box, styled from the old layer's (now per-shape)
 * style. An all-zero frame migrates to `grids: []`.
 *
 * @param {object} oldLayer a deserializeLegacyLayer result
 * @returns {{visible: boolean, grids: object[]}[]}
 */
function migrateLegacyFrames(oldLayer) {
  return oldLayer.frames.map((frame) => {
    const bounds = minimalBounds({ width: oldLayer.width, height: oldLayer.height, pixels: frame.pixels });
    if (!bounds) return { visible: frame.visible, grids: [] };
    const { minX, minY, maxX, maxY } = bounds;
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const pixels = resizeAt({ width: oldLayer.width, height: oldLayer.height, pixels: frame.pixels }, width, height, -minX, -minY).pixels;
    return {
      visible: frame.visible,
      grids: [
        {
          id: makeGridId(),
          name: 'Shape 1',
          offsetX: oldLayer.offset.x + minX,
          offsetY: oldLayer.offset.y + minY,
          width,
          height,
          pixels,
          style: cloneLayerStyle(oldLayer.style),
          visible: true,
          locked: false,
          opacity: 1,
        },
      ],
    };
  });
}

/**
 * Collapses every old per-color auto-layer of a Simple-tier save into one
 * new Layer — for each frame, that Layer's `grids` list gets one migrated
 * Grid per old auto-layer that had content in that frame (so
 * `frame.grids.length` can be > 1 immediately after load, same as a
 * freshly-drawn Simple-tier canvas going forward).
 *
 * @param {object[]} oldLayers deserializeLegacyLayer results
 * @param {number} frameCount
 * @returns {object[]} a single-element new-shape Layer array
 */
function migrateSimpleTierLayers(oldLayers, frameCount) {
  const frames = Array.from({ length: frameCount }, () => ({ visible: true, grids: [] }));
  let shapeCounter = 0;
  for (const oldLayer of oldLayers) {
    migrateLegacyFrames(oldLayer).forEach((migratedFrame, i) => {
      for (const grid of migratedFrame.grids) {
        grid.name = `Shape ${++shapeCounter}`;
        frames[i].grids.push(grid);
      }
    });
  }
  return [{ id: makeLayerId(), name: 'Layer 1', locked: false, opacity: 1, frames }];
}

/**
 * @param {object[]} oldLayersJson raw `canvas.layers` from a pre-v3 doc
 * @param {'simple'|'advanced'} tier
 * @param {number} pixelyphVersion
 * @param {number} frameCount
 * @returns {object[]} new-shape Layer array
 */
function migrateLegacyLayers(oldLayersJson, tier, pixelyphVersion, frameCount) {
  const oldLayers = oldLayersJson.map((layer) => deserializeLegacyLayer(layer, pixelyphVersion));
  if (tier === 'simple') return migrateSimpleTierLayers(oldLayers, frameCount);
  // Advanced-tier saves migrate 1:1 — each old layer keeps its own id/name/
  // locked/opacity and lands with exactly one Grid per frame it had content
  // in (multi-grid Advanced-tier layers only arise from new "+ Add Shape"
  // use going forward, not from migrated data).
  return oldLayers.map((oldLayer) => ({
    id: oldLayer.id,
    name: oldLayer.name,
    locked: oldLayer.locked,
    opacity: oldLayer.opacity,
    frames: migrateLegacyFrames(oldLayer),
  }));
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
      activeGridId: canvas.activeGridId ?? null,
      // Animation (Phase 7): frameCount/frameDurations are artwork content
      // (every layer's frames.length matches frameCount; frameDurations is
      // the authored per-frame timing every animated export reads);
      // activeFrame/frameRate are working-session/playback conveniences
      // persisted the same way symmetryMode/activeLayerId already are.
      frameCount: canvas.frameCount,
      activeFrame: canvas.activeFrame,
      frameRate: canvas.frameRate,
      frameDurations: canvas.frameDurations,
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
  const pixelyphVersion = doc.pixelyphVersion ?? 1;
  const frameCount = c.frameCount ?? 1;
  const layers = pixelyphVersion >= 3 ? c.layers.map((layer) => deserializeLayerV3(layer, pixelyphVersion)) : migrateLegacyLayers(c.layers, c.tier, pixelyphVersion, frameCount);
  // A migrated Simple-tier save's old activeLayerId pointed at one of the
  // now-discarded per-color auto-layers — repoint it at the single
  // collapsed Layer this migration produces. Advanced-tier saves (and any
  // v3+ save) keep their own activeLayerId untouched, since layer ids
  // migrate/round-trip 1:1.
  const activeLayerId = pixelyphVersion < 3 && c.tier === 'simple' ? (layers[0]?.id ?? null) : (c.activeLayerId ?? null);
  return {
    id: c.id,
    width: c.width,
    height: c.height,
    tier: c.tier,
    // Pre-Phase-9 saves have a bare string[] palette; normalizePalette
    // migrates it to the { colors, fills, styles } shape transparently.
    palette: normalizePalette(c.palette),
    symmetryMode: c.symmetryMode,
    referenceImage: c.referenceImage ?? undefined,
    activeLayerId,
    // Doesn't exist before v3 — a migrated save simply opens with nothing
    // selected; the first paint stroke (or Session 3's UI) picks a shape.
    activeGridId: c.activeGridId ?? null,
    // Fall back to single-frame defaults for projects saved before Phase 7 —
    // no version-migration step exists yet (see the plan's "explicitly
    // deferred" note), so old files simply don't have these fields. Files
    // saved after per-frame duration shipped but that still predate it
    // (frameCount present, frameDurations absent) get a uniform duration
    // array derived from frameRate instead.
    frameCount,
    activeFrame: c.activeFrame ?? 0,
    frameRate: c.frameRate ?? 12,
    frameDurations: c.frameDurations ?? new Array(frameCount).fill(Math.round(1000 / (c.frameRate ?? 12))),
    layers,
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

// backgroundPixels/foregroundPixels are optional, additive fields (see
// GlyphSet.js's addBackgroundLayer/addForegroundLayer — model-only for now,
// no editing UI yet) — present only when a glyph actually has that layer,
// so old saves need no migration: the key is simply absent, same as today.
function serializeGlyph(glyph) {
  return {
    width: glyph.width,
    height: glyph.height,
    pixels: bitsToBase64(glyph.pixels),
    advanceWidth: glyph.advanceWidth,
    leftSideBearing: glyph.leftSideBearing,
    name: glyph.name,
    ...(glyph.backgroundPixels ? { backgroundPixels: bitsToBase64(glyph.backgroundPixels) } : {}),
    ...(glyph.foregroundPixels ? { foregroundPixels: bitsToBase64(glyph.foregroundPixels) } : {}),
  };
}

function deserializeGlyph(glyph, pixelyphVersion) {
  const length = glyph.width * glyph.height;
  return {
    width: glyph.width,
    height: glyph.height,
    pixels: decodePixels(glyph.pixels, length, pixelyphVersion),
    advanceWidth: glyph.advanceWidth,
    leftSideBearing: glyph.leftSideBearing,
    name: glyph.name,
    ...(glyph.backgroundPixels !== undefined ? { backgroundPixels: decodePixels(glyph.backgroundPixels, length, pixelyphVersion) } : {}),
    ...(glyph.foregroundPixels !== undefined ? { foregroundPixels: decodePixels(glyph.foregroundPixels, length, pixelyphVersion) } : {}),
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
  // Pre-merge saves carry a GlyphSet-level `kind` ('characters'|'icons')
  // and a per-glyph `unicode` field — both simply ignored on load now.
  // Every existing glyph in every existing save is already correctly
  // positioned relative to the Private Use Area boundary by construction
  // (old icon glyphs were always PUA-keyed; old character glyphs are
  // real-Unicode-keyed), so isAutoAssignedCodepoint reproduces the same
  // per-glyph behavior those fields used to gate, with no backfill needed.
  // `iconTilePadding` was renamed `horizontalPadding` once it started
  // applying to every glyph, not just auto-assigned ones — a save carrying
  // the old key gets it copied across so a previously-set padding value
  // survives the rename instead of silently reverting to 0.
  const meta =
    gs.meta.horizontalPadding === undefined && gs.meta.iconTilePadding !== undefined
      ? { ...gs.meta, horizontalPadding: gs.meta.iconTilePadding }
      : gs.meta;
  return {
    id: gs.id,
    meta,
    glyphs: new Map(gs.glyphs.map(([codepoint, glyph]) => [codepoint, deserializeGlyph(glyph, doc.pixelyphVersion ?? 1)])),
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
