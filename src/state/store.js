// Wraps model/ for the UI. `canvas` is a plain mutable object (not the
// usual zustand-immutable-update pattern) — model functions mutate it in
// place, and this file swaps in a fresh top-level `{ ...canvas }` reference
// only when React actually needs to notice (see `commit()`). That split
// matters for the pointer-drag hot path: `paintCellLive` mutates without
// calling `set()` at all, so a freehand stroke doesn't trigger a React
// render per cell — SvgPixelEditor pushes the recomputed `d` straight to
// the DOM via a ref instead, and `commit()` only runs once, on pointer-up.
//
// Phase 4 simplification: a single active document at a time (`canvas` for
// draw mode, `glyphSet` for glyph mode). Mode is chosen once at project
// creation and never toggled. A single `history` stack serves both modes —
// safe because mode is fixed: the stack never mixes canvas and glyph
// snapshots. `projectOpen` controls the startup screen vs. the editor.

import { create } from 'zustand';
import {
  createCanvas,
  paintCell as paintCanvasCell,
  resizeCanvas as resizeCanvasModel,
  colorAt,
  addLayer as addLayerModel,
  removeLayer as removeLayerModel,
  reorderLayer as reorderLayerModel,
  duplicateLayer as duplicateLayerModel,
  mergeLayerDown as mergeLayerDownModel,
  addGrid as addGridModel,
  removeGrid as removeGridModel,
  reorderGrid as reorderGridModel,
  duplicateGrid as duplicateGridModel,
  mergeGridDown as mergeGridDownModel,
  nudgeLayerFrame as nudgeLayerFrameModel,
  flipLayerFrameH,
  flipLayerFrameV,
  rotateLayerFrame90,
  flipCanvasFrameH,
  flipCanvasFrameV,
  rotateCanvasFrame90,
  currentFrameIndex,
  refreshActiveGrid as refreshActiveGridModel,
  clampActiveLayer,
  topVisibleLayerAt,
  convertTier as convertTierModel,
  addFrame as addFrameModel,
  duplicateFrame as duplicateFrameModel,
  removeFrame as removeFrameModel,
  reorderFrame as reorderFrameModel,
  setActiveFrame as setActiveFrameModel,
  setFrameDuration as setFrameDurationModel,
  setLayerFrameVisibility as setLayerFrameVisibilityModel,
  cloneLayerStyle,
  cloneFillValue,
} from '../model/Canvas.js';
import { mirrorPoints } from '../model/mirror.js';
import { makeGridId } from '../model/Grid.js';
import { createHistory, pushSnapshot, undo as historyUndo, redo as historyRedo, canUndo as historyCanUndo, canRedo as historyCanRedo } from '../model/history.js';
import {
  normalizeRect,
  extractRectColors,
  extractRectFromActiveLayer,
  extractRectFromActiveGrid,
  clearRect,
  clearRectFromActiveLayer,
  pasteCells,
  transformSelectionCells,
  liftGridSelection as liftGridSelectionModel,
  moveGridSelectionBy as moveGridSelectionByModel,
  transformGridSelection as transformGridSelectionModel,
  finalizeGridSelection as finalizeGridSelectionModel,
  clearGridSelectionSource,
  pruneEmptyGridsForSelection,
  buildFloatingGridPreviewDoc,
  buildGridClonesByColor,
  buildGridCloneUnioned,
} from '../model/selection.js';
import { parseLospecPalette } from '../model/paletteImport.js';
import {
  addColor as addPaletteColorModel,
  addFill as addPaletteFillModel,
  addStyle as addPaletteStyleModel,
  removeEntry as removePaletteEntryModel,
  reorderEntry as reorderPaletteEntryModel,
  renameEntry as renamePaletteEntryModel,
  clearGroup as clearPaletteGroupModel,
  serializePaletteFile,
  parsePaletteFile,
} from '../model/Palette.js';
import { importRasterToGrid, generatePalette } from '../model/importRaster.js';
import { decodeImageFile } from '../io/imageDecode.js';
import { composeLayersSvg } from '../export/svg/composeLayersSvg.js';
import { composeAnimatedSvg } from '../export/svg/animatedSvg.js';
import { rasterizeFrame } from '../export/raster/rasterizeFrame.js';
import { buildSpriteSheet } from '../export/raster/spriteSheet.js';
import { buildSpriteArchive, buildSpriteArchiveSvg } from '../export/raster/spriteArchive.js';
import { buildAnimatedGif } from '../export/raster/animatedRaster.js';
import { buildAnimatedApng } from '../export/raster/animatedPng.js';
import { copySvgToClipboard } from '../export/clipboard.js';
import { serializeProject, deserializeProject, saveProjectToString, loadProjectFromString, serializeGlyphSetProject, deserializeGlyphSetProject, saveGlyphProjectToString, loadGlyphProjectFromString } from '../io/projectFile.js';
import { saveFile, openFile } from '../io/platform.js';
import { readAutosave, clearAutosave, createAutosaveScheduler } from '../io/autosave.js';
import { createGlyphSet, createGlyph, setGlyph as setGlyphModel, removeGlyph as removeGlyphModel, nextAutoCodepoint, addGlyphsFromCodepoints as addGlyphsFromCodepointsModel, resizeGlyphSet as resizeGlyphSetModel, glyphToCanvas, canvasToGlyphPixels, flipGlyphH, flipGlyphV, rotateGlyph90 as rotateGlyph90Model, GLYPH_FILL } from '../model/GlyphSet.js';
import { resize as resizeGrid, flipGridH, flipGridV, rotateGrid90 } from '../model/Grid.js';
import { glyphToSvg } from '../export/svg/glyphSvg.js';
import { buildDrawDocument, buildGlyphDocument, DEFAULT_INITIAL_CHARSET_PRESET } from '../model/projectFactory.js';
import { compileFont, fontToArrayBuffer } from '../export/font/compileFont.js';
import { toWoff, toWoff2 } from '../export/font/woff.js';
import { generateIconFontCss } from '../export/font/iconFontCss.js';
import { generateDemoHtml } from '../export/font/demoHtml.js';
import { slugify } from '../export/slugify.js';
import { createZip } from '../export/zip.js';

function contentSnapshot(canvas) {
  // frameCount/frameDurations are artwork content (every layer's
  // frames.length matches frameCount; frameDurations is the authored
  // per-frame timing) — included so undo correctly reverts an
  // add/duplicate/remove-frame action or a duration edit, same as any other
  // structural edit. activeFrame is excluded, same reasoning as
  // activeLayerId below (a working-session pointer, not content).
  return {
    layers: canvas.layers,
    width: canvas.width,
    height: canvas.height,
    palette: canvas.palette,
    tier: canvas.tier,
    frameCount: canvas.frameCount,
    frameDurations: canvas.frameDurations,
  };
}

function applyContentSnapshot(canvas, snapshot) {
  const prevLayerId = canvas.activeLayerId;
  canvas.layers = snapshot.layers;
  canvas.width = snapshot.width;
  canvas.height = snapshot.height;
  canvas.palette = snapshot.palette;
  canvas.tier = snapshot.tier;
  canvas.frameCount = snapshot.frameCount;
  canvas.frameDurations = snapshot.frameDurations;
  // activeLayerId/activeFrame/activeGridId are excluded from snapshots
  // (working-session concerns, not artwork), so a restored `layers` array
  // might no longer contain/fit them.
  clampActiveLayer(canvas);
  canvas.activeFrame = Math.max(0, Math.min(canvas.activeFrame, canvas.frameCount - 1));
  // Passing prevLayerId lets refreshActiveGridModel's sticky-selection
  // heuristic keep the same shape active across undo/redo when it's still
  // on the same (still-existing) layer and its id survived the restore --
  // omitting it (as this used to) makes `sameLayer` always false, so
  // resolveActiveGrid always fell back to the layer's first shape on every
  // single undo/redo, regardless of what was actually selected.
  refreshActiveGridModel(canvas, prevLayerId);
}

function glyphContentSnapshot(glyphSet) {
  return { meta: glyphSet.meta, glyphs: Array.from(glyphSet.glyphs.entries()) };
}

function applyGlyphContentSnapshot(glyphSet, snapshot) {
  glyphSet.meta = snapshot.meta;
  glyphSet.glyphs = new Map(snapshot.glyphs);
}

/** Read side of a selection, honoring `selectionScope` in advanced tier. */
function extractSelection(canvas, selectionScope, rect) {
  if (canvas.tier === 'advanced' && selectionScope === 'activeShape') return extractRectFromActiveGrid(canvas, rect);
  if (canvas.tier === 'advanced' && selectionScope === 'activeLayer') return extractRectFromActiveLayer(canvas, rect);
  return extractRectColors(canvas, rect);
}

/** A flat floatingSelection's current bounds, in the same {x0,y0,x1,y1} shape as a rect. */
function floatingSelectionRect(fs) {
  return { x0: fs.x, y0: fs.y, x1: fs.x + fs.width - 1, y1: fs.y + fs.height - 1 };
}

/**
 * Where a clipboard payload's `originRect` lands on `doc` — same position
 * it was copied/cut from (paste-in-place), clamped to stay fully in
 * bounds if the origin doesn't fit (a smaller target canvas, or a
 * near-edge origin). Every clipboard payload carries an `originRect` (set
 * by copySelection/cutSelection) — external paste (pasteImageBlob) never
 * goes through `clipboard` at all, so it isn't affected by this and keeps
 * its own independent centering.
 */
function pastePosition(doc, clipboard) {
  return {
    x: Math.max(0, Math.min(doc.width - clipboard.width, clipboard.originRect.x0)),
    y: Math.max(0, Math.min(doc.height - clipboard.height, clipboard.originRect.y0)),
  };
}

/**
 * Snapshots a floatingGridSelection's current clones onto the clipboard —
 * independent deep copies (own `pixels` arrays), so later dragging/
 * transforming the still-live floating selection can never retroactively
 * mutate what's already on the clipboard. `originRect` is the selection's
 * rect at snapshot time, kept for same-canvas paste-in-place.
 */
function snapshotGridClipboard(fgs) {
  const clones = fgs.clones.map((c) => ({
    offsetX: c.grid.offsetX,
    offsetY: c.grid.offsetY,
    width: c.grid.width,
    height: c.grid.height,
    pixels: c.grid.pixels.slice(),
    style: c.grid.style,
    opacity: c.grid.opacity,
  }));
  return { kind: 'grid', originRect: { ...fgs.rect }, width: fgs.rect.x1 - fgs.rect.x0 + 1, height: fgs.rect.y1 - fgs.rect.y0 + 1, clones };
}

/** Clear side of a selection — matches whichever scope did the reading. */
function clearSelectionRect(canvas, selectionScope, rect) {
  if (canvas.tier === 'advanced' && selectionScope === 'activeLayer') {
    clearRectFromActiveLayer(canvas, rect);
    return;
  }
  clearRect(canvas, rect);
}

const autosaveScheduler = createAutosaveScheduler();

/**
 * Whole-canvas rotate, generalized to `times` 90°-clockwise passes (1 =
 * today's rotateCanvas90, 2 = 180°, 3 = counter-clockwise 90°) — reuses
 * rotateCanvasFrame90's already-tested per-frame/per-layer math rather than
 * writing new pixel transforms. Width/height must swap once *per pass*, not
 * once total: each pass's offset math needs the canvas dimensions as they
 * stand after the previous pass, same as a single real 90° rotation would.
 * @param {object} canvas
 * @param {number} times
 * @param {boolean} allFrames
 */
function rotateCanvasNTimes(canvas, times, allFrames) {
  const frameIndices = allFrames ? (canvas.layers[0]?.frames.map((_, i) => i) ?? [currentFrameIndex(canvas)]) : [currentFrameIndex(canvas)];
  for (let t = 0; t < times; t++) {
    for (const idx of frameIndices) rotateCanvasFrame90(canvas, idx);
    const oldWidth = canvas.width;
    canvas.width = canvas.height;
    canvas.height = oldWidth;
  }
}

export const useStore = create((set, get) => {
  const initialCanvas = buildDrawDocument();

  /** Swaps in a fresh `canvas` reference so subscribers re-render, without cloning the (already-mutated) nested content. */
  function touchCanvas() {
    set({ canvas: { ...get().canvas } });
  }

  /** Rebuilds a glyph's pseudo-Canvas for editing, tinted with the transient glyphDisplayColor UI preference if one is set (falls back to glyphToCanvas's own black default otherwise) — a canvas-rendering convenience, not document data. */
  function buildGlyphCanvas(glyph) {
    return glyphToCanvas(glyph, get().glyphDisplayColor || undefined);
  }

  // --- Animation playback (Phase 7 follow-on) ---
  // A single setTimeout chain, not a store field — a timer handle isn't
  // serializable/reactive state, same reasoning as autosaveScheduler below.
  // Re-reads `get()` fresh on every tick rather than closing over `canvas`,
  // so it naturally adapts if frameCount/durations change mid-playback
  // (e.g. a frame gets added or removed while the animation is running).
  let playbackTimeoutId = null;

  function stopPlaybackTimer() {
    if (playbackTimeoutId != null) {
      clearTimeout(playbackTimeoutId);
      playbackTimeoutId = null;
    }
  }

  function scheduleNextPlaybackFrame() {
    const { canvas, isPlaying } = get();
    if (!isPlaying || canvas.frameCount <= 1) {
      set({ isPlaying: false });
      return;
    }
    const duration = canvas.frameDurations[canvas.activeFrame] ?? Math.max(1, Math.round(1000 / canvas.frameRate));
    playbackTimeoutId = setTimeout(() => {
      const state = get();
      if (!state.isPlaying) return; // paused while this tick was waiting
      const nextFrame = (state.canvas.activeFrame + 1) % state.canvas.frameCount;
      setActiveFrameModel(state.canvas, nextFrame);
      touchCanvas();
      scheduleNextPlaybackFrame();
    }, duration);
  }

  /**
   * Single commit function for both modes. In glyph mode, reads the active
   * glyph's pixels back out of `glyphCanvas` before snapshotting — matching
   * the behavior of the old per-mode commitGlyph()/commit() pair, now unified
   * because mode is fixed per project and can't change mid-session.
   */
  function commit() {
    const { mode, canvas, glyphSet, glyphCanvas, activeCodepoint, history } = get();
    if (mode === 'glyph') {
      if (glyphCanvas && activeCodepoint != null) {
        const glyph = glyphSet.glyphs.get(activeCodepoint);
        if (glyph) glyph.pixels = canvasToGlyphPixels(glyphCanvas);
      }
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      set({
        glyphSet: { ...glyphSet },
        // Mirrors draw mode's `canvas: { ...canvas }` below: any store
        // action that mutates `glyphCanvas` in place and commits directly
        // (bypassing SvgPixelEditor's ctx.*-wrapped `tick()` re-render,
        // e.g. dropFloatingSelection called from the Enter-key handler or
        // MenuBar's Edit > Commit move / Transform > Selection scope) needs
        // a fresh `glyphCanvas` reference here so the composed-SVG useMemo
        // (keyed on `[doc, canvas, glyphCanvas, tickCount]`) actually
        // recomputes instead of returning stale pre-commit markup.
        glyphCanvas: glyphCanvas ? { ...glyphCanvas } : glyphCanvas,
        history: { ...history },
        canUndo: historyCanUndo(history),
        canRedo: historyCanRedo(history),
      });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    } else {
      pushSnapshot(history, contentSnapshot(canvas));
      set({ canvas: { ...canvas }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
      autosaveScheduler(serializeProject(canvas));
    }
  }

  /**
   * Transform-menu "Selection" scope. Move and Transform are now the same
   * underlying operation (this session's selection redesign — see
   * docs/data-model.md's Selection section): both act on whichever
   * floating selection is pending, composably, any number of times in any
   * order, before one eventual Finalize/Cancel — Transform is no longer a
   * special instant-commit case.
   *
   * - **Advanced (Shape) tier, no flat floatingSelection in play**: lifts
   *   (destructively) into a `floatingGridSelection` if nothing's pending
   *   yet — real, style-preserving Grid clones, never flattened to a
   *   color — then applies the transform to whatever's pending (freshly
   *   lifted or already mid-drag-move). Stays pending: no commit() here,
   *   same as Move — only dropFloatingGridSelection/
   *   cancelFloatingGridSelection are real undo boundaries.
   * - **Everything else** (Pixel tier, Glyph mode): the original flat
   *   per-cell-color floating-selection path, unchanged — lifts a
   *   still-rectangular `selection` first (destructive) if nothing's
   *   floating yet, transforms `floatingSelection.cells`, stays pending.
   *
   * @param {'flipH'|'flipV'|'rotate90'} kind
   * @param {number} times
   */
  function transformSelectionInStore(kind, times) {
    const { mode, canvas, glyphCanvas, selection, floatingSelection, floatingGridSelection, selectionScope } = get();
    const doc = mode === 'glyph' ? glyphCanvas : canvas;
    if (mode === 'draw' && doc.tier === 'advanced' && !floatingSelection) {
      let fgs = floatingGridSelection;
      if (!fgs) {
        if (!selection) return;
        const rect = normalizeRect(selection.x0, selection.y0, selection.x1, selection.y1);
        fgs = liftGridSelectionModel(doc, selectionScope, rect, true);
        if (!fgs) return;
      }
      for (let i = 0; i < times; i++) transformGridSelectionModel(fgs, kind);
      set({ floatingGridSelection: { ...fgs, touched: true }, selection: null });
      return;
    }

    let fs = get().floatingSelection;
    if (!fs) {
      get().liftSelection(true);
      fs = get().floatingSelection;
      if (!fs) return;
      // liftSelection's destructive clear mutates the doc in place without
      // swapping its reference — SvgPixelEditor's own ctx.liftSelection call
      // sites paper over this with a local re-render `tick()`, but this
      // store action is called directly from MenuBar.jsx, which has no
      // access to that tick. Without a fresh doc reference here, the
      // memoized composed SVG body (keyed on `[doc, canvas, glyphCanvas,
      // tickCount]`) stays stale and the cleared source stays visibly
      // duplicated underneath the floating (flipped/rotated) preview until
      // the eventual drop. Mirrors pasteImageBlob's same mode-aware pattern.
      const { mode: m2, canvas: c2, glyphCanvas: g2 } = get();
      const doc2 = m2 === 'glyph' ? g2 : c2;
      set(m2 === 'glyph' ? { glyphCanvas: { ...doc2 } } : { canvas: { ...doc2 } });
    }
    let { width, height, cells } = fs;
    for (let i = 0; i < times; i++) {
      cells = transformSelectionCells(width, height, cells, kind);
      if (kind === 'rotate90') [width, height] = [height, width];
    }
    set({ floatingSelection: { ...fs, cells, width, height } });
  }

  /**
   * Rotates the active glyph 90°-clockwise `times` times, generalizing the
   * single-rotate case (rotateGlyph90Model already self-normalizes the
   * glyph's height back to pixelsPerEm on every call, so looping it is
   * safe). Only the *first* rotation in a multi-step sequence can ever be
   * lossy — once normalized, rotating an already-pixelsPerEm-tall glyph
   * again never needs a re-crop — so the confirm check only runs once, up
   * front, exactly like the original single-rotate action did.
   * @param {number} times
   */
  function rotateActiveGlyphNTimes(times) {
    return async () => {
      const { glyphSet, history, activeCodepoint } = get();
      if (activeCodepoint == null) return;
      const glyph = glyphSet.glyphs.get(activeCodepoint);
      if (!glyph) return;
      const needsRecrop = glyph.width !== glyphSet.meta.pixelsPerEm;
      if (
        needsRecrop &&
        !(await get().requestConfirm(
          `Rotating this glyph changes its height to ${glyph.width}px — it'll be re-cropped/padded back to ${glyphSet.meta.pixelsPerEm}px, which can cut off content. Continue?`,
        ))
      ) {
        return;
      }
      for (let t = 0; t < times; t++) rotateGlyph90Model(glyphSet, glyph);
      glyph.advanceWidth = glyph.width;
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history), glyphCanvas: buildGlyphCanvas(glyph) });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    };
  }

  return {
    canvas: initialCanvas,
    history: createHistory(contentSnapshot(initialCanvas)),
    canUndo: false,
    canRedo: false,

    // Phase 4: one active document at a time. Mode is fixed at project creation;
    // switching modes requires creating a new project. `glyphCanvas` is the
    // active glyph re-wrapped as a single-color pseudo-Canvas for SvgPixelEditor.
    projectOpen: false,
    mode: 'draw', // 'draw' | 'glyph' — fixed per project after Phase 4
    glyphSet: null,
    glyphCanvas: null,
    activeCodepoint: null,
    initialCharsetPreset: DEFAULT_INITIAL_CHARSET_PRESET,

    activeTool: 'pencil',
    activeColor: '#000000',
    shapeFilled: false,
    brushWidth: 1,
    ditherEnabled: false,
    // Shape-tier external-paste color handling: 'multiple' groups pasted
    // pixels into one Grid clone per distinct color (buildGridClonesByColor,
    // full color fidelity, N shapes); 'single' unions them into one Grid
    // clone painted with activeColor (buildGridCloneUnioned, one restylable
    // shape, discards per-pixel color). See docs/data-model.md's Selection
    // section.
    pasteColorMode: 'multiple',
    fillGlobal: false,
    fillTolerance: 0,
    pixelPerfect: false,
    zoom: 16,
    pan: { x: 0, y: 0 },
    viewportSize: { width: 0, height: 0 },
    showGrid: false,
    // Glyph-mode-only canvas display preference (like showGrid): what color
    // a glyph's pixels render as on the editing canvas. null = use the
    // default hardcoded fill. Not exported, not saved, not undo-tracked.
    glyphDisplayColor: null,
    tileGridSize: 0, // 0 = off; a positive integer = tile guide size in cells
    flipRotateAllFrames: false, // frame-scope choice for layer/canvas-level flip/rotate — this frame only (false) or every frame (true)
    sidePanelTab: 'palette', // which SidePanel.jsx tab is showing — lifted to the store (not local component state) so SvgPixelEditor can gate the gradient-angle handle on "Style tab is visible"
    gradientHandleEnabledGridId: null, // the one Grid id (if any) whose on-canvas gradient-angle handle is toggled on — always starts null on a fresh shape selection, never remembered across shapes

    selection: null,
    floatingSelection: null,
    floatingGridSelection: null,
    selectionScope: 'activeShape',

    setActiveTool: (tool) => set({ activeTool: tool }),
    setActiveColor: (color) => set({ activeColor: color }),
    setShapeFilled: (filled) => set({ shapeFilled: filled }),
    setBrushWidth: (brushWidth) => set({ brushWidth }),
    setDitherEnabled: (ditherEnabled) => set({ ditherEnabled }),
    /**
     * Also regenerates a pending, untouched, external-paste-sourced
     * floatingGridSelection's clones in place (same rect/layerId, rebuilt
     * from the raw decoded cells it was created from) — the "decided once
     * at paste-creation time" choice from docs/data-model.md's Selection
     * section, just deferred by one toggle click after the paste keystroke.
     * Once the user has moved/transformed the pending selection (`touched`),
     * this only updates the persisted default for the next paste — the
     * ContextBar control itself hides at that point (see ContextBar.jsx),
     * so regrouping shape count mid-manipulation can't happen.
     */
    setPasteColorMode: (pasteColorMode) =>
      set((s) => {
        const fgs = s.floatingGridSelection;
        if (!fgs || !fgs.pasteRaw || fgs.touched) return { pasteColorMode };
        const { x, y, cells } = fgs.pasteRaw;
        const clones =
          pasteColorMode === 'single' ? buildGridCloneUnioned(x, y, cells, { fill: s.activeColor, effects: [] }) : buildGridClonesByColor(x, y, cells);
        return { pasteColorMode, floatingGridSelection: { ...fgs, clones } };
      }),
    setFillGlobal: (fillGlobal) => set({ fillGlobal }),
    setFillTolerance: (fillTolerance) => set({ fillTolerance }),
    setPixelPerfect: (pixelPerfect) => set({ pixelPerfect }),
    setZoom: (zoom) => set({ zoom }),
    setPan: (pan) => set({ pan }),
    setViewportSize: (viewportSize) => set({ viewportSize }),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    setGlyphDisplayColor: (color) => set({ glyphDisplayColor: color }),
    setTileGridSize: (size) => set({ tileGridSize: Math.max(0, Math.round(Number(size) || 0)) }),
    setFlipRotateAllFrames: (allFrames) => set({ flipRotateAllFrames: allFrames }),
    setSidePanelTab: (tab) => set({ sidePanelTab: tab }),
    /** `enabled: false` always clears the field outright (not just for `gridId`), since only one shape's handle can be toggled on at a time. */
    setGradientHandleEnabled: (gridId, enabled) => set({ gradientHandleEnabledGridId: enabled ? gridId : null }),
    setSelectionScope: (scope) => set({ selectionScope: scope }),

    // Working-session conveniences: persisted with the project, excluded from undo.
    setSymmetryMode: (symmetryMode) => {
      const { mode, glyphCanvas, canvas } = get();
      if (mode === 'glyph') {
        if (!glyphCanvas) return;
        glyphCanvas.symmetryMode = symmetryMode;
        set({ glyphCanvas: { ...glyphCanvas } });
        return;
      }
      canvas.symmetryMode = symmetryMode;
      touchCanvas();
    },
    setReferenceImage: (dataUrl) => {
      get().canvas.referenceImage = { dataUrl, opacity: 0.5, locked: false };
      touchCanvas();
    },
    setReferenceImageOpacity: (opacity) => {
      const { canvas } = get();
      if (canvas.referenceImage) canvas.referenceImage.opacity = opacity;
      touchCanvas();
    },
    clearReferenceImage: () => {
      get().canvas.referenceImage = undefined;
      touchCanvas();
    },

    /** Mirror-aware per-cell paint — the hot pointer-drag path. */
    paintCellLive: (x, y, color) => {
      const { mode, glyphCanvas, glyphDisplayColor } = get();
      if (mode === 'glyph') {
        if (!glyphCanvas) return;
        // Glyph pixels are a boolean on/off bitmap underneath (see
        // canvasToGlyphPixels) — the hex actually painted here is purely a
        // canvas-rendering choice, so it always follows glyphDisplayColor
        // (falling back to GLYPH_FILL) rather than the shared Draw-mode
        // activeColor a tool might otherwise pass in.
        const glyphColor = color == null ? null : (glyphDisplayColor || GLYPH_FILL);
        for (const p of mirrorPoints(glyphCanvas.width, glyphCanvas.height, x, y, glyphCanvas.symmetryMode)) {
          paintCanvasCell(glyphCanvas, p.x, p.y, glyphColor);
        }
        return;
      }
      const { canvas } = get();
      for (const p of mirrorPoints(canvas.width, canvas.height, x, y, canvas.symmetryMode)) {
        paintCanvasCell(canvas, p.x, p.y, color);
      }
    },
    /** Call once per finished stroke/fill/paste (pointer-up), not per cell. */
    commitStroke: () => commit(),

    colorAt: (x, y) => {
      const { mode, glyphCanvas, canvas } = get();
      if (mode === 'glyph') return glyphCanvas ? colorAt(glyphCanvas, x, y) : null;
      return colorAt(canvas, x, y);
    },

    // --- Advanced tier: layers panel + per-layer/per-shape style ---
    setActiveLayerId: (layerId) => {
      const { canvas } = get();
      const prevLayerId = canvas.activeLayerId;
      canvas.activeLayerId = layerId;
      refreshActiveGridModel(canvas, prevLayerId);
      touchCanvas();
    },
    /** Advanced-tier eyedropper: activates the topmost layer at (x, y). */
    selectTopLayerAt: (x, y) => {
      const { canvas } = get();
      const layer = topVisibleLayerAt(canvas, x, y);
      if (!layer) return;
      const prevLayerId = canvas.activeLayerId;
      canvas.activeLayerId = layer.id;
      refreshActiveGridModel(canvas, prevLayerId);
      touchCanvas();
    },
    /** Explicit shape selection (Layers panel row click) — sets both fields directly, deliberately bypassing resolveActiveGrid's sticky-selection heuristic, which only applies to automatic frame/layer-switch resolution. */
    setActiveGridId: (layerId, gridId) => {
      const { canvas } = get();
      canvas.activeLayerId = layerId;
      canvas.activeGridId = gridId;
      touchCanvas();
    },
    /** Deselects the active shape (select-and-drag tool: clicking empty canvas in Shape tier) — mirrors setActiveGridId, minus a target to select. */
    clearActiveGrid: () => {
      get().canvas.activeGridId = null;
      touchCanvas();
    },
    addLayer: () => {
      addLayerModel(get().canvas, {});
      commit();
    },
    removeLayer: (layerId) => {
      removeLayerModel(get().canvas, layerId);
      commit();
    },
    reorderLayer: (layerId, direction) => {
      reorderLayerModel(get().canvas, layerId, direction);
      commit();
    },
    duplicateLayer: (layerId) => {
      duplicateLayerModel(get().canvas, layerId);
      commit();
    },
    mergeLayerDown: (layerId) => {
      mergeLayerDownModel(get().canvas, layerId);
      commit();
    },
    // --- Advanced tier: per-layer shapes ("Shape" in the UI, Grid in code — see docs/data-model.md) ---
    addGrid: (layerId) => {
      addGridModel(get().canvas, layerId, { style: { fill: get().activeColor, effects: [] } });
      commit();
    },
    removeGrid: (layerId, gridId) => {
      removeGridModel(get().canvas, layerId, gridId);
      commit();
    },
    reorderGrid: (layerId, gridId, direction) => {
      reorderGridModel(get().canvas, layerId, gridId, direction);
      commit();
    },
    duplicateGrid: (layerId, gridId) => {
      duplicateGridModel(get().canvas, layerId, gridId);
      commit();
    },
    mergeGridDown: (layerId, gridId) => {
      mergeGridDownModel(get().canvas, layerId, gridId);
      commit();
    },
    setGridProps: (layerId, gridId, patch) => {
      const canvas = get().canvas;
      const layer = canvas.layers.find((l) => l.id === layerId);
      const grid = layer?.frames[currentFrameIndex(canvas)]?.grids.find((g) => g.id === gridId);
      if (!grid) return;
      Object.assign(grid, patch);
      commit();
    },
    /** Live (uncommitted) shape-drag variant of setGridProps — the select-and-drag tool's pointer-drag hot path. Mutates in place, no commit() call; pointer-up calls the ordinary committing action once (via commitStroke), same paintCellLive/commitStroke split used for painting. */
    setGridPropsLive: (layerId, gridId, patch) => {
      const canvas = get().canvas;
      const layer = canvas.layers.find((l) => l.id === layerId);
      const grid = layer?.frames[currentFrameIndex(canvas)]?.grids.find((g) => g.id === gridId);
      if (!grid) return;
      Object.assign(grid, patch);
    },
    /** Nudge target for Pixel tier / Glyph mode: shifts a whole layer's active-frame content, mode-aware like colorAt. */
    nudgeLayerFrame: (layerId, frameIndex, dx, dy) => {
      const { mode, canvas, glyphCanvas } = get();
      const doc = mode === 'glyph' ? glyphCanvas : canvas;
      if (!doc) return;
      nudgeLayerFrameModel(doc, layerId, frameIndex, dx, dy);
      commit();
    },
    /** Live (uncommitted) variant of nudgeLayerFrame — the select-and-drag tool's pointer-drag hot path in Pixel tier/Glyph mode. See setGridPropsLive. */
    nudgeLayerFrameLive: (layerId, frameIndex, dx, dy) => {
      const { mode, canvas, glyphCanvas } = get();
      const doc = mode === 'glyph' ? glyphCanvas : canvas;
      if (!doc) return;
      nudgeLayerFrameModel(doc, layerId, frameIndex, dx, dy);
    },

    // --- Flip/rotate (Checkpoint 6) — Shape tier only (LayersPanel's Shape
    // rows never render in Pixel tier or Glyph mode, so these are never
    // reachable there; no mode/tier guard needed beyond the null-check). ---
    flipActiveShapeH: () => {
      const canvas = get().canvas;
      const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
      const grid = layer?.frames[currentFrameIndex(canvas)]?.grids.find((g) => g.id === canvas.activeGridId);
      if (!grid) return;
      flipGridH(grid);
      commit();
    },
    flipActiveShapeV: () => {
      const canvas = get().canvas;
      const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
      const grid = layer?.frames[currentFrameIndex(canvas)]?.grids.find((g) => g.id === canvas.activeGridId);
      if (!grid) return;
      flipGridV(grid);
      commit();
    },
    rotateActiveShape90: () => {
      const canvas = get().canvas;
      const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
      const grid = layer?.frames[currentFrameIndex(canvas)]?.grids.find((g) => g.id === canvas.activeGridId);
      if (!grid) return;
      rotateGrid90(grid);
      commit();
    },
    // rotateGrid90 re-centers the shape on every call (see Grid.js), so
    // looping it composes correctly for 180/CCW — same reasoning as
    // rotateCanvasNTimes/rotateActiveGlyphNTimes above.
    rotateActiveShape180: () => {
      const canvas = get().canvas;
      const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
      const grid = layer?.frames[currentFrameIndex(canvas)]?.grids.find((g) => g.id === canvas.activeGridId);
      if (!grid) return;
      rotateGrid90(grid);
      rotateGrid90(grid);
      commit();
    },
    rotateActiveShapeCCW90: () => {
      const canvas = get().canvas;
      const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
      const grid = layer?.frames[currentFrameIndex(canvas)]?.grids.find((g) => g.id === canvas.activeGridId);
      if (!grid) return;
      rotateGrid90(grid);
      rotateGrid90(grid);
      rotateGrid90(grid);
      commit();
    },

    // --- Flip/rotate — layer-level (both tiers). Honors flipRotateAllFrames
    // for which frame(s) of the active layer get transformed. ---
    flipActiveLayerH: () => {
      const { canvas, flipRotateAllFrames } = get();
      const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
      if (!layer) return;
      const frameIndices = flipRotateAllFrames ? layer.frames.map((_, i) => i) : [currentFrameIndex(canvas)];
      for (const idx of frameIndices) flipLayerFrameH(canvas, layer.id, idx);
      commit();
    },
    flipActiveLayerV: () => {
      const { canvas, flipRotateAllFrames } = get();
      const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
      if (!layer) return;
      const frameIndices = flipRotateAllFrames ? layer.frames.map((_, i) => i) : [currentFrameIndex(canvas)];
      for (const idx of frameIndices) flipLayerFrameV(canvas, layer.id, idx);
      commit();
    },
    rotateActiveLayer90: () => {
      const { canvas, flipRotateAllFrames } = get();
      const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
      if (!layer) return;
      const frameIndices = flipRotateAllFrames ? layer.frames.map((_, i) => i) : [currentFrameIndex(canvas)];
      for (const idx of frameIndices) rotateLayerFrame90(canvas, layer.id, idx);
      commit();
    },
    // rotateLayerFrame90 repositions against canvas.width/height, which a
    // layer-only rotate never changes (unlike the canvas-level case) — so
    // those dimensions stay fixed across every pass and looping this is a
    // direct, no-special-casing generalization.
    rotateActiveLayer180: () => {
      const { canvas, flipRotateAllFrames } = get();
      const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
      if (!layer) return;
      const frameIndices = flipRotateAllFrames ? layer.frames.map((_, i) => i) : [currentFrameIndex(canvas)];
      for (const idx of frameIndices) {
        rotateLayerFrame90(canvas, layer.id, idx);
        rotateLayerFrame90(canvas, layer.id, idx);
      }
      commit();
    },
    rotateActiveLayerCCW90: () => {
      const { canvas, flipRotateAllFrames } = get();
      const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
      if (!layer) return;
      const frameIndices = flipRotateAllFrames ? layer.frames.map((_, i) => i) : [currentFrameIndex(canvas)];
      for (const idx of frameIndices) {
        rotateLayerFrame90(canvas, layer.id, idx);
        rotateLayerFrame90(canvas, layer.id, idx);
        rotateLayerFrame90(canvas, layer.id, idx);
      }
      commit();
    },

    // --- Flip/rotate — whole-canvas (Draw mode only; Glyph mode's
    // whole-glyph equivalent is flipActiveGlyphH/V/rotateActiveGlyph90
    // below, which also needs the pixelsPerEm re-crop/confirm step canvas
    // rotation doesn't). Honors flipRotateAllFrames like the layer-level
    // actions above. ---
    flipCanvasH: () => {
      const { canvas, flipRotateAllFrames } = get();
      const frameIndices = flipRotateAllFrames ? (canvas.layers[0]?.frames.map((_, i) => i) ?? [currentFrameIndex(canvas)]) : [currentFrameIndex(canvas)];
      for (const idx of frameIndices) flipCanvasFrameH(canvas, idx);
      commit();
    },
    flipCanvasV: () => {
      const { canvas, flipRotateAllFrames } = get();
      const frameIndices = flipRotateAllFrames ? (canvas.layers[0]?.frames.map((_, i) => i) ?? [currentFrameIndex(canvas)]) : [currentFrameIndex(canvas)];
      for (const idx of frameIndices) flipCanvasFrameV(canvas, idx);
      commit();
    },
    rotateCanvas90: () => {
      rotateCanvasNTimes(get().canvas, 1, get().flipRotateAllFrames);
      commit();
    },
    rotateCanvas180: () => {
      rotateCanvasNTimes(get().canvas, 2, get().flipRotateAllFrames);
      commit();
    },
    rotateCanvasCCW90: () => {
      rotateCanvasNTimes(get().canvas, 3, get().flipRotateAllFrames);
      commit();
    },

    setLayerProps: (layerId, patch) => {
      const layer = get().canvas.layers.find((l) => l.id === layerId);
      if (!layer) return;
      Object.assign(layer, patch);
      commit();
    },
    /** Visibility is per-frame (Layer.js) — this toggles it for whichever frame is currently active, leaving every other frame's visibility for this layer untouched. */
    setLayerFrameVisibility: (layerId, visible) => {
      setLayerFrameVisibilityModel(get().canvas, layerId, get().canvas.activeFrame, visible);
      commit();
    },
    updateGridStyle: (layerId, gridId, patch) => {
      const canvas = get().canvas;
      const layer = canvas.layers.find((l) => l.id === layerId);
      const grid = layer?.frames[currentFrameIndex(canvas)]?.grids.find((g) => g.id === gridId);
      if (!grid) return;
      grid.style = { ...grid.style, ...patch };
      commit();
    },
    /**
     * Live (uncommitted) grid-style patch — the paintCellLive/commitStroke
     * shape applied to style edits: mutates `grid.style` in place with no
     * `set()`/`commit()`, so it's safe to call once per pointermove during a
     * drag (e.g. the on-canvas gradient-angle handle) without spamming undo
     * history or autosave. Caller must force its own re-render (same `tick()`
     * trick SvgPixelEditor uses for paintCellLive). Call `updateGridStyle`
     * once on pointer-up to commit the final value as one undo entry.
     */
    updateGridStyleLive: (layerId, gridId, patch) => {
      const canvas = get().canvas;
      const layer = canvas.layers.find((l) => l.id === layerId);
      const grid = layer?.frames[currentFrameIndex(canvas)]?.grids.find((g) => g.id === gridId);
      if (!grid) return;
      grid.style = { ...grid.style, ...patch };
    },
    setTier: (newTier) => {
      convertTierModel(get().canvas, newTier, get().activeColor);
      commit();
    },

    // --- Animation (Phase 7): frames ---
    // add/duplicate/remove/setFrameDuration are committed actions (undo-
    // tracked, like a resize or style change — see Canvas.js's
    // addFrame/duplicateFrame/removeFrame for the "every layer stays in
    // lockstep" invariant, and setFrameDuration for the per-frame timing
    // every animated export reads); setActiveFrame/setFrameRate are
    // working-session pointer moves/playback settings, same as
    // setActiveLayerId/setSymmetryMode above — setFrameRate in particular
    // only sets the *default* duration a newly-added frame gets, it doesn't
    // retroactively rescale existing frames' durations.
    onionSkinEnabled: false,
    addFrame: (index) => {
      addFrameModel(get().canvas, index);
      commit();
    },
    duplicateFrame: (index) => {
      duplicateFrameModel(get().canvas, index);
      commit();
    },
    removeFrame: (index) => {
      removeFrameModel(get().canvas, index);
      commit();
    },
    reorderFrame: (index, direction) => {
      reorderFrameModel(get().canvas, index, direction);
      commit();
    },
    /** Manual frame navigation — also stops playback, the same "scrubbing takes back control" convention most animation/video UIs use. */
    setActiveFrame: (index) => {
      stopPlaybackTimer();
      setActiveFrameModel(get().canvas, index);
      set({ isPlaying: false });
      touchCanvas();
    },
    setFrameRate: (fps) => {
      get().canvas.frameRate = fps;
      touchCanvas();
    },
    setFrameDuration: (index, durationMs) => {
      setFrameDurationModel(get().canvas, index, durationMs);
      commit();
    },
    toggleOnionSkin: () => set((s) => ({ onionSkinEnabled: !s.onionSkinEnabled })),

    /** In-editor animation preview: steps activeFrame on a timer using each frame's own duration, looping forever. Doesn't touch undo (setActiveFrameModel isn't a committed action). */
    isPlaying: false,
    playAnimation: () => {
      if (get().canvas.frameCount <= 1) return; // nothing to animate
      set({ isPlaying: true });
      scheduleNextPlaybackFrame();
    },
    pauseAnimation: () => {
      stopPlaybackTimer();
      set({ isPlaying: false });
    },
    togglePlayback: () => (get().isPlaying ? get().pauseAnimation() : get().playAnimation()),

    undo: () => {
      const { mode, canvas, glyphSet, activeCodepoint, history } = get();
      const snapshot = historyUndo(history);
      if (!snapshot) return;
      if (mode === 'glyph') {
        applyGlyphContentSnapshot(glyphSet, snapshot);
        const activeGlyph = activeCodepoint != null ? glyphSet.glyphs.get(activeCodepoint) : null;
        set({
          glyphSet: { ...glyphSet },
          history: { ...history },
          glyphCanvas: activeGlyph ? buildGlyphCanvas(activeGlyph) : null,
          canUndo: historyCanUndo(history),
          canRedo: historyCanRedo(history),
        });
        autosaveScheduler(serializeGlyphSetProject(glyphSet));
      } else {
        applyContentSnapshot(canvas, snapshot);
        set({ canvas: { ...canvas }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
        autosaveScheduler(serializeProject(canvas));
      }
    },
    redo: () => {
      const { mode, canvas, glyphSet, activeCodepoint, history } = get();
      const snapshot = historyRedo(history);
      if (!snapshot) return;
      if (mode === 'glyph') {
        applyGlyphContentSnapshot(glyphSet, snapshot);
        const activeGlyph = activeCodepoint != null ? glyphSet.glyphs.get(activeCodepoint) : null;
        set({
          glyphSet: { ...glyphSet },
          history: { ...history },
          glyphCanvas: activeGlyph ? buildGlyphCanvas(activeGlyph) : null,
          canUndo: historyCanUndo(history),
          canRedo: historyCanRedo(history),
        });
        autosaveScheduler(serializeGlyphSetProject(glyphSet));
      } else {
        applyContentSnapshot(canvas, snapshot);
        set({ canvas: { ...canvas }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
        autosaveScheduler(serializeProject(canvas));
      }
    },

    resizeCanvas: (newWidth, newHeight, anchor) => {
      resizeCanvasModel(get().canvas, newWidth, newHeight, anchor);
      commit();
    },

    // --- Palette (Phase 9): the shared swatch library — colors, saved
    // fill values (gradients/patterns), and saved full layer styles. Each
    // group's add/remove/reorder/clear is a thin wrapper over Palette.js's
    // pure functions, committed (undo-tracked) the same way every other
    // structural edit is.
    addPaletteColor: (hex) => {
      addPaletteColorModel(get().canvas.palette, hex);
      commit();
    },
    addPaletteFill: (fillValue) => {
      addPaletteFillModel(get().canvas.palette, fillValue);
      commit();
    },
    addPaletteStyle: (styleValue, name) => {
      addPaletteStyleModel(get().canvas.palette, name != null ? { ...cloneLayerStyle(styleValue), name } : cloneLayerStyle(styleValue));
      commit();
    },
    removePaletteEntry: (group, key) => {
      removePaletteEntryModel(get().canvas.palette, group, key);
      commit();
    },
    reorderPaletteEntry: (group, key, direction) => {
      reorderPaletteEntryModel(get().canvas.palette, group, key, direction);
      commit();
    },
    renamePaletteEntry: (group, key, name) => {
      renamePaletteEntryModel(get().canvas.palette, group, key, name);
      commit();
    },
    clearPaletteGroup: (group) => {
      clearPaletteGroupModel(get().canvas.palette, group);
      commit();
    },
    /** Advanced tier only: applies a palette entry to the active shape — colors set `fill` to that color, fills clone their gradient/pattern value into `fill`, styles replace fill+stroke+effects wholesale. */
    applyPaletteEntryToActiveGrid: (group, key) => {
      const { canvas } = get();
      const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
      const grid = layer?.frames[currentFrameIndex(canvas)]?.grids.find((g) => g.id === canvas.activeGridId);
      if (!grid) return;
      if (group === 'colors') {
        grid.style = { ...grid.style, fill: key };
      } else if (group === 'fills') {
        const entry = canvas.palette.fills.find((f) => f.id === key);
        if (!entry) return;
        const { id, ...fillValue } = entry;
        grid.style = { ...grid.style, fill: cloneFillValue(fillValue) };
      } else if (group === 'styles') {
        const entry = canvas.palette.styles.find((s) => s.id === key);
        if (!entry) return;
        grid.style = cloneLayerStyle(entry);
      } else {
        return;
      }
      commit();
    },
    importLospecPalette: (text) => {
      const colors = parseLospecPalette(text);
      if (colors.length === 0) return;
      get().canvas.palette.colors = colors;
      commit();
    },
    /**
     * Generates a fresh palette from an image (median-cut quantization, see
     * generatePalette), then either appends the new colors to the existing
     * palette (deduped) or replaces it wholesale — `mode` is decided by the
     * caller (the UI's Add/Replace prompt), not asked here.
     */
    importPaletteFromImage: async (file, { maxColors = 16, mode } = {}) => {
      const { canvas } = get();
      const image = await decodeImageFile(file);
      const colors = generatePalette(image, maxColors);
      if (colors.length === 0) return;
      if (mode === 'add') {
        const merged = [...canvas.palette.colors];
        for (const color of colors) if (!merged.includes(color)) merged.push(color);
        canvas.palette.colors = merged;
      } else {
        canvas.palette.colors = colors;
      }
      commit();
    },
    /** Imports a previously-exported Pixelyph palette (colors + fills + styles), replacing the whole palette. */
    importPixelyphPalette: (text) => {
      const parsed = parsePaletteFile(text);
      if (!parsed) return false;
      get().canvas.palette = parsed;
      commit();
      return true;
    },
    exportPalette: async () => {
      const text = serializePaletteFile(get().canvas.palette);
      await saveFile('palette.pixelyph-palette.json', new Blob([text], { type: 'application/json' }));
    },
    // Working-session UI state (like activeTool/selection above) — not
    // undo-tracked, opened from both the Palette menu and the Palette
    // panel's own "Manage" button.
    manageSwatchesOpen: false,
    setManageSwatchesOpen: (open) => set({ manageSwatchesOpen: open }),

    // Same pattern for the other menu-driven modals: Export (File menu, both
    // modes), Import Image / Reference Image (File menu, draw mode), About
    // (Help menu).
    exportModalOpen: false,
    setExportModalOpen: (open) => set({ exportModalOpen: open }),
    bulkAddModalOpen: false,
    setBulkAddModalOpen: (open) => set({ bulkAddModalOpen: open }),
    importImageModalOpen: false,
    setImportImageModalOpen: (open) => set({ importImageModalOpen: open }),
    referenceImageModalOpen: false,
    setReferenceImageModalOpen: (open) => set({ referenceImageModalOpen: open }),
    aboutModalOpen: false,
    setAboutModalOpen: (open) => set({ aboutModalOpen: open }),
    userManualOpen: false,
    setUserManualOpen: (open) => set({ userManualOpen: open }),

    // Set by File > New Project just before closeProject() below, so
    // StartupScreen can skip its title screen and land directly on the
    // wizard's Choose Mode step. StartupScreen reads and clears this on
    // mount so it doesn't leak into a later, unrelated visit to the title
    // screen (e.g. after "Continue Last Session").
    skipToNewProjectWizard: false,
    setSkipToNewProjectWizard: (skip) => set({ skipToNewProjectWizard: skip }),

    // Promise-based replacement for window.confirm — `confirmDialog` holds
    // the pending message + its resolver while a confirm modal is open, so
    // both React components and store actions (which can't use hooks) can
    // `await requestConfirm(message)` the same way.
    confirmDialog: null,
    requestConfirm: (message) => new Promise((resolve) => set({ confirmDialog: { message, resolve } })),
    resolveConfirm: (result) => {
      get().confirmDialog?.resolve(result);
      set({ confirmDialog: null });
    },

    // Same promise-based pattern as requestConfirm/resolveConfirm, but for
    // the 3-way "Cancel / Add / Replace" choice generating a palette from an
    // image needs (a plain boolean confirm doesn't fit) — resolves to
    // 'add' | 'replace' | null (null = cancel).
    paletteImportModeDialog: null,
    requestPaletteImportMode: () => new Promise((resolve) => set({ paletteImportModeDialog: { resolve } })),
    resolvePaletteImportMode: (result) => {
      get().paletteImportModeDialog?.resolve(result);
      set({ paletteImportModeDialog: null });
    },

    // Same promise-based pattern as requestConfirm/resolveConfirm, but for
    // prompting a text name (e.g. naming a palette gradient/style on save)
    // instead of a yes/no choice — resolves to the trimmed name string, or
    // null on Cancel/Escape.
    nameDialog: null,
    requestName: (label, defaultValue = '') => new Promise((resolve) => set({ nameDialog: { label, defaultValue, resolve } })),
    resolveName: (result) => {
      get().nameDialog?.resolve(result);
      set({ nameDialog: null });
    },

    // --- Project lifecycle (Phase 4) ---

    /**
     * Creates a new project of the given mode, resetting all document state.
     * If a project is already open, the caller should have already confirmed
     * the discard (the header button does this) — but there's a safety confirm
     * here too in case newProject is called programmatically with projectOpen true.
     */
    newProject: async (mode, options = {}) => {
      if (get().projectOpen && !(await get().requestConfirm('Discard the current project and start a new one?'))) return;
      stopPlaybackTimer();
      set({ isPlaying: false });
      if (mode === 'glyph') {
        const { glyphSet, initialPreset, seededCodepoint } = buildGlyphDocument(options);
        const h = createHistory(glyphContentSnapshot(glyphSet));
        const seededGlyph = seededCodepoint != null ? glyphSet.glyphs.get(seededCodepoint) : null;
        set({
          mode: 'glyph',
          projectOpen: true,
          initialCharsetPreset: initialPreset,
          canvas: buildDrawDocument(),
          glyphSet,
          glyphCanvas: seededGlyph ? buildGlyphCanvas(seededGlyph) : null,
          activeCodepoint: seededCodepoint,
          history: h,
          canUndo: false,
          canRedo: false,
          selection: null,
          floatingSelection: null,
          floatingGridSelection: null,
        });
      } else {
        const canvas = buildDrawDocument();
        const h = createHistory(contentSnapshot(canvas));
        set({
          mode: 'draw',
          projectOpen: true,
          canvas,
          glyphSet: null,
          glyphCanvas: null,
          history: h,
          canUndo: false,
          canRedo: false,
          selection: null,
          floatingSelection: null,
          floatingGridSelection: null,
        });
      }
    },

    /** Called by the header "New Project" button after the user confirms discarding the current project. */
    closeProject: () => {
      stopPlaybackTimer();
      set({ projectOpen: false, isPlaying: false, skipToNewProjectWizard: true });
    },

    // --- Glyph mode: GlyphSet operations ---

    /**
     * Makes `codepoint` the active glyph — a working-session pointer move,
     * not a committed action. Clears any pending selection/floating
     * selection: it was lifted against the *previous* glyph's pseudo-Canvas
     * and would otherwise render/act against the wrong document once
     * `glyphCanvas` is swapped out here (see the plan's cross-glyph
     * copy-paste note — `clipboard`, not `floatingSelection`, is what's
     * meant to survive a glyph switch).
     */
    selectGlyph: (codepoint) => {
      const { glyphSet } = get();
      const glyph = glyphSet.glyphs.get(codepoint);
      set({ activeCodepoint: codepoint, glyphCanvas: glyph ? buildGlyphCanvas(glyph) : null, selection: null, floatingSelection: null, floatingGridSelection: null });
    },
    /**
     * Unified glyph-creation action, replacing the old assignCodepoint/
     * addIconGlyph split. `character` (a real codepoint) is used as the
     * literal Map key when given; otherwise one is auto-assigned from the
     * Private Use Area. `name` is attached regardless. Calling with both
     * fields empty/absent is valid — it's the "add a completely bare empty
     * glyph" action. Collision confirmation (GlyphSet.wouldCollide) is a UI
     * concern, same as the old actions — this always just performs the
     * write, replacing any existing glyph at that codepoint.
     */
    addGlyph: ({ character, name = '' } = {}) => {
      const { glyphSet, history } = get();
      const codepoint = character ?? nextAutoCodepoint(glyphSet);
      const width = glyphSet.meta.defaultGlyphWidth != null
        ? glyphSet.meta.defaultGlyphWidth
        : character != null
          ? Math.max(1, Math.round(glyphSet.meta.pixelsPerEm * 0.75))
          : Math.max(1, Math.round(glyphSet.meta.pixelsPerEm));
      const glyph = createGlyph({ width, height: glyphSet.meta.pixelsPerEm, name });
      setGlyphModel(glyphSet, codepoint, glyph);
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, history: { ...history }, activeCodepoint: codepoint, glyphCanvas: buildGlyphCanvas(glyph), canUndo: historyCanUndo(history), canRedo: historyCanRedo(history), selection: null, floatingSelection: null, floatingGridSelection: null });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    /**
     * Bulk-creation entry point (Bulk-Add modal / New Project wizard's
     * initial preset): creates an empty-grid glyph at every codepoint in
     * `codepoints` that doesn't already exist, skipping any that do — no
     * destructive overwrite in a bulk operation, unlike single-glyph
     * addGlyph. No-op (no snapshot pushed) if every codepoint already exists.
     */
    addGlyphsFromPreset: (codepoints) => {
      const { glyphSet, history } = get();
      if (!addGlyphsFromCodepointsModel(glyphSet, codepoints)) return;
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    /**
     * Re-keys an existing glyph to a new codepoint (delete + re-insert —
     * under the unified model, a real assigned character is the Map key
     * itself, not a decorative side field, so "edit selected glyph's
     * character" has to move the entry). Collision confirmation is a UI
     * concern, same as addGlyph. activeCodepoint follows the glyph to its
     * new key if it was the active one.
     */
    reassignGlyphCodepoint: (oldCodepoint, newCodepoint) => {
      const { glyphSet, history, activeCodepoint } = get();
      const glyph = glyphSet.glyphs.get(oldCodepoint);
      if (!glyph || oldCodepoint === newCodepoint) return;
      removeGlyphModel(glyphSet, oldCodepoint);
      setGlyphModel(glyphSet, newCodepoint, glyph);
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      set({
        glyphSet: { ...glyphSet },
        history: { ...history },
        canUndo: historyCanUndo(history),
        canRedo: historyCanRedo(history),
        ...(activeCodepoint === oldCodepoint ? { activeCodepoint: newCodepoint } : {}),
      });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    removeGlyphAction: (codepoint) => {
      const { glyphSet, history, activeCodepoint } = get();
      removeGlyphModel(glyphSet, codepoint);
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      set({
        glyphSet: { ...glyphSet },
        history: { ...history },
        canUndo: historyCanUndo(history),
        canRedo: historyCanRedo(history),
        ...(activeCodepoint === codepoint ? { activeCodepoint: null, glyphCanvas: null } : {}),
      });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    updateGlyphMeta: (codepoint, patch) => {
      const { glyphSet, history } = get();
      const glyph = glyphSet.glyphs.get(codepoint);
      if (!glyph) return;
      if ('name' in patch) glyph.name = patch.name;
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    updateFontMeta: (patch) => {
      const { glyphSet, history } = get();
      glyphSet.meta = { ...glyphSet.meta, ...patch };
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    resizeFontPixelsPerEm: (newPixelsPerEm, anchor = 'top-left') => {
      const { glyphSet, history, activeCodepoint } = get();
      resizeGlyphSetModel(glyphSet, newPixelsPerEm, anchor);
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      const activeGlyph = activeCodepoint != null ? glyphSet.glyphs.get(activeCodepoint) : null;
      set({ glyphSet: { ...glyphSet }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history), glyphCanvas: activeGlyph ? buildGlyphCanvas(activeGlyph) : null });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    resizeActiveGlyph: (newWidth, anchor = 'top-left') => {
      const { glyphSet, history, activeCodepoint } = get();
      if (activeCodepoint == null) return;
      const glyph = glyphSet.glyphs.get(activeCodepoint);
      if (!glyph) return;
      glyph.pixels = resizeGrid(glyph, newWidth, glyph.height, anchor).pixels;
      glyph.width = newWidth;
      glyph.advanceWidth = newWidth;
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history), glyphCanvas: buildGlyphCanvas(glyph) });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },

    // --- Flip/rotate (Checkpoint 6) — Glyph mode operates directly on the
    // active Glyph's own flat pixel buffer (mirroring resizeActiveGlyph's
    // pattern above), not the layer/offset machinery Draw mode's canvas-
    // level actions use — a glyph has no layers/offsets of its own, just
    // one buffer. Flip needs no special handling (dimensions unchanged);
    // rotate can change the glyph's height, which every other glyph in the
    // font expects to stay at a uniform pixelsPerEm, so it re-crops/pads
    // back afterward (rotateGlyph90Model), confirmed first when that's
    // actually lossy.
    flipActiveGlyphH: () => {
      const { glyphSet, history, activeCodepoint } = get();
      if (activeCodepoint == null) return;
      const glyph = glyphSet.glyphs.get(activeCodepoint);
      if (!glyph) return;
      flipGlyphH(glyph);
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history), glyphCanvas: buildGlyphCanvas(glyph) });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    flipActiveGlyphV: () => {
      const { glyphSet, history, activeCodepoint } = get();
      if (activeCodepoint == null) return;
      const glyph = glyphSet.glyphs.get(activeCodepoint);
      if (!glyph) return;
      flipGlyphV(glyph);
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history), glyphCanvas: buildGlyphCanvas(glyph) });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    rotateActiveGlyph90: rotateActiveGlyphNTimes(1),
    rotateActiveGlyph180: rotateActiveGlyphNTimes(2),
    rotateActiveGlyphCCW90: rotateActiveGlyphNTimes(3),

    exportGlyphSvg: async () => {
      const { glyphSet, activeCodepoint } = get();
      const glyph = activeCodepoint != null ? glyphSet.glyphs.get(activeCodepoint) : null;
      if (!glyph) return;
      const svg = glyphToSvg(glyph);
      await saveFile(`glyph-u${activeCodepoint.toString(16)}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
    },
    saveGlyphProject: async () => {
      const text = saveGlyphProjectToString(get().glyphSet);
      await saveFile('untitled-font.pixelyph', new Blob([text], { type: 'application/json' }));
      await clearAutosave();
    },

    /**
     * Compiles the current GlyphSet into whichever font file(s) are
     * selected, compiling the font and deriving WOFF/WOFF2 buffers at most
     * once regardless of how many formats are checked. `demoHtml` and
     * `cssManifest` are separate boolean options rather than a `format`
     * string, since FontExportPanel lets several be exported together in
     * one click.
     *
     * WOFF2 (toWoff2, woff.js) can time out — see that file's KNOWN ISSUE
     * comment and BACKLOG.md — so it's disabled entirely for now
     * (WOFF2_EXPORT_ENABLED below) rather than left to eat an 8s timeout on
     * every export that includes a demo HTML. The `woff2Failed` return flag
     * and its fallback handling are left in place (dormant, `woff2` is
     * never true while disabled) so re-enabling later is just flipping this
     * one constant back to `true` and restoring FontExportPanel's checkbox.
     *
     * More than one resulting file is bundled into a single .zip (createZip,
     * export/zip.js) rather than triggering one save dialog/download per
     * file — a single selected format still saves directly, unzipped.
     *
     * @param {{otf?: boolean, woff?: boolean, woff2?: boolean, demoHtml?: boolean, cssManifest?: boolean}} options
     * @returns {Promise<{woff2Failed: boolean}>}
     */
    exportFont: async ({ otf = false, woff = false, woff2 = false, demoHtml: wantDemoHtml = false, cssManifest = false } = {}) => {
      const WOFF2_EXPORT_ENABLED = false; // see BACKLOG.md
      const { glyphSet } = get();
      if (!glyphSet) return { woff2Failed: false };
      const font = compileFont(glyphSet);
      const otfBuffer = fontToArrayBuffer(font);
      const baseName = slugify(glyphSet.meta.familyName) || 'font';
      const textEncoder = new TextEncoder();

      let woffBytes = null;
      let woff2Bytes = null;
      let woff2Failed = false;
      // `wantDemoHtml` computes woffBytes unconditionally (independent of
      // the `woff` checkbox) because the demo HTML always embeds WOFF —
      // never the OTF — regardless of which standalone files the user
      // separately checked; see demoHtml.js's file header for why that's
      // the right choice (WOFF is a lossless, smaller repackaging of the
      // same compiled font, and the standard @font-face embedding format).
      if (woff || wantDemoHtml) woffBytes = toWoff(otfBuffer);
      if (WOFF2_EXPORT_ENABLED && (woff2 || wantDemoHtml)) {
        try {
          woff2Bytes = await toWoff2(otfBuffer);
        } catch (err) {
          console.error('WOFF2 export failed', err);
          woff2Failed = true;
        }
      }

      const files = [];
      if (otf) files.push({ name: `${baseName}.otf`, data: new Uint8Array(otfBuffer), type: 'font/otf' });
      if (woff) files.push({ name: `${baseName}.woff`, data: woffBytes, type: 'font/woff' });
      if (woff2 && woff2Bytes) files.push({ name: `${baseName}.woff2`, data: woff2Bytes, type: 'font/woff2' });
      if (wantDemoHtml) {
        const html = generateDemoHtml(glyphSet, woff2Bytes, woffBytes);
        files.push({ name: `${baseName}-demo.html`, data: textEncoder.encode(html), type: 'text/html' });
      }
      if (cssManifest) {
        // Reference only the format(s) actually being exported alongside
        // this CSS (woff2 excluded — see WOFF2_EXPORT_ENABLED above), so
        // the generated @font-face src never points at a file that isn't
        // in the export bundle.
        const { css, manifest } = generateIconFontCss(glyphSet, { formats: { otf, woff } });
        files.push({ name: `${baseName}.css`, data: textEncoder.encode(css), type: 'text/css' });
        files.push({ name: `${baseName}.json`, data: textEncoder.encode(JSON.stringify(manifest, null, 2)), type: 'application/json' });
      }

      if (files.length > 1) {
        const zipBytes = createZip(files.map(({ name, data }) => ({ name, data })));
        await saveFile(`${baseName}.zip`, new Blob([zipBytes], { type: 'application/zip' }));
      } else if (files.length === 1) {
        const [{ name, data, type }] = files;
        await saveFile(name, new Blob([data], { type }));
      }

      return { woff2Failed: woff2Failed && woff2 };
    },

    // --- Selection: marquee move/cut/copy/paste ---
    // Mode-aware (Phase 5): reads/writes the active document — Draw mode's
    // `canvas`, or Glyph mode's `glyphCanvas` pseudo-Canvas — via the same
    // doc indirection paintCellLive/colorAt/undo/redo already use. Glyph
    // mode's pseudo-Canvas is always 'simple' tier with at most one layer,
    // so extractSelection/clearSelectionRect's advanced-tier branches never
    // trigger for it — no new scope concept needed there. `clipboard` is a
    // single app-level slot independent of which document is active, so
    // copying part of one glyph and pasting into a different glyph (after
    // switching via selectGlyph) falls out for free.
    startSelection: (x, y) => set({ selection: { x0: x, y0: y, x1: x, y1: y } }),
    updateSelection: (x, y) => set((s) => (s.selection ? { selection: { ...s.selection, x1: x, y1: y } } : {})),
    clearSelection: () => set({ selection: null, floatingSelection: null, floatingGridSelection: null }),
    selectAll: () => {
      const { mode, canvas, glyphCanvas } = get();
      const doc = mode === 'glyph' ? glyphCanvas : canvas;
      if (!doc) return;
      set({ activeTool: 'marqueeSelect', selection: { x0: 0, y0: 0, x1: doc.width - 1, y1: doc.height - 1 }, floatingSelection: null, floatingGridSelection: null });
    },
    liftSelection: (destructive) => {
      const { mode, canvas, glyphCanvas, selection, selectionScope } = get();
      const doc = mode === 'glyph' ? glyphCanvas : canvas;
      if (!doc || !selection) return;
      const rect = normalizeRect(selection.x0, selection.y0, selection.x1, selection.y1);
      const cells = extractSelection(doc, selectionScope, rect);
      if (destructive) {
        const originalGridId = doc.activeGridId;
        clearSelectionRect(doc, selectionScope, rect);
        // Clearing can empty out (and delete) the very shape being lifted,
        // which reassigns activeGridId to some *other* shape sharing its
        // layer as a side effect (see paintCell/eraseFromLayer's erase
        // branch, which falls back to `frame.grids[0]` when the active
        // grid is the one just removed) — restore it so the eventual
        // paste-back (pasteCells -> paintCell) targets the original shape,
        // or safely allocates a fresh one if it's now gone, instead of
        // silently merging the moved/transformed content into whichever
        // unrelated shape activeGridId happened to drift to.
        doc.activeGridId = originalGridId;
      }
      set({ floatingSelection: { x: rect.x0, y: rect.y0, width: rect.x1 - rect.x0 + 1, height: rect.y1 - rect.y0 + 1, cells } });
    },
    moveFloatingSelection: (x, y) => set((s) => (s.floatingSelection ? { floatingSelection: { ...s.floatingSelection, x, y } } : {})),
    /**
     * Shape tier's analog of liftSelection — never mutates `canvas` (unlike
     * liftSelection's immediate destructive clear); clearing is deferred
     * all the way to dropFloatingGridSelection, so cancelFloatingGridSelection
     * can be a true no-op instead of a history revert.
     */
    liftGridSelection: (destructive) => {
      const { mode, canvas, glyphCanvas, selection, selectionScope } = get();
      const doc = mode === 'glyph' ? glyphCanvas : canvas;
      if (!doc || !selection) return;
      const rect = normalizeRect(selection.x0, selection.y0, selection.x1, selection.y1);
      const fgs = liftGridSelectionModel(doc, selectionScope, rect, destructive);
      if (!fgs) return;
      set({ floatingGridSelection: fgs });
    },
    moveGridSelectionBy: (dx, dy) =>
      set((s) => {
        if (!s.floatingGridSelection) return {};
        const fgs = { ...s.floatingGridSelection, touched: true };
        moveGridSelectionByModel(fgs, dx, dy);
        return { floatingGridSelection: fgs };
      }),
    flipSelectionH: () => transformSelectionInStore('flipH', 1),
    flipSelectionV: () => transformSelectionInStore('flipV', 1),
    rotateSelection90: () => transformSelectionInStore('rotate90', 1),
    rotateSelection180: () => transformSelectionInStore('rotate90', 2),
    rotateSelectionCCW90: () => transformSelectionInStore('rotate90', 3),
    dropFloatingSelection: () => {
      const { mode, canvas, glyphCanvas, floatingSelection, floatingGridSelection } = get();
      const doc = mode === 'glyph' ? glyphCanvas : canvas;
      if (!doc) return;
      if (floatingGridSelection) {
        finalizeGridSelectionModel(doc, floatingGridSelection);
        set({ selection: null, floatingSelection: null, floatingGridSelection: null });
        commit();
        return;
      }
      if (!floatingSelection) return;
      pasteCells(doc, floatingSelection.x, floatingSelection.y, floatingSelection.cells);
      set({ selection: null, floatingSelection: null, floatingGridSelection: null });
      commit(); // mode-aware: syncs glyphCanvas back into the active Glyph's pixels in glyph mode
    },
    cancelFloatingSelection: () => {
      const { mode, canvas, glyphSet, activeCodepoint, history, floatingGridSelection } = get();
      // floatingGridSelection never mutated the document (clearing is
      // deferred to finalize) — cancelling it is a pure state discard, no
      // history revert needed, unlike the flat floatingSelection path
      // below (whose destructive liftSelection already mutated `canvas`).
      if (floatingGridSelection) {
        set({ selection: null, floatingGridSelection: null });
        return;
      }
      if (mode === 'glyph') {
        applyGlyphContentSnapshot(glyphSet, history.stack[history.index]);
        const activeGlyph = activeCodepoint != null ? glyphSet.glyphs.get(activeCodepoint) : null;
        set({ glyphSet: { ...glyphSet }, glyphCanvas: activeGlyph ? buildGlyphCanvas(activeGlyph) : null, selection: null, floatingSelection: null, floatingGridSelection: null });
        return;
      }
      applyContentSnapshot(canvas, history.stack[history.index]);
      set({ canvas: { ...canvas }, selection: null, floatingSelection: null, floatingGridSelection: null });
    },

    clipboard: null,

    copySelection: () => {
      const { mode, canvas, glyphCanvas, selection, floatingSelection, floatingGridSelection, selectionScope } = get();
      const doc = mode === 'glyph' ? glyphCanvas : canvas;
      if (floatingGridSelection) {
        set({ clipboard: snapshotGridClipboard(floatingGridSelection) });
        return;
      }
      if (floatingSelection) {
        set({ clipboard: { kind: 'flat', originRect: floatingSelectionRect(floatingSelection), width: floatingSelection.width, height: floatingSelection.height, cells: floatingSelection.cells } });
        return;
      }
      if (!doc || !selection) return;
      const rect = normalizeRect(selection.x0, selection.y0, selection.x1, selection.y1);
      if (doc.tier === 'advanced') {
        const fgs = liftGridSelectionModel(doc, selectionScope, rect, false); // non-destructive: originals stay put, clones float as a fresh duplicate
        if (!fgs) return;
        set({ clipboard: snapshotGridClipboard(fgs), selection: null, floatingGridSelection: fgs });
        return;
      }
      const width = rect.x1 - rect.x0 + 1;
      const height = rect.y1 - rect.y0 + 1;
      const cells = extractSelection(doc, selectionScope, rect);
      set({ clipboard: { kind: 'flat', originRect: rect, width, height, cells }, selection: null, floatingSelection: { x: rect.x0, y: rect.y0, width, height, cells } });
    },
    cutSelection: () => {
      const { mode, canvas, glyphCanvas, selection, floatingSelection, floatingGridSelection, selectionScope } = get();
      const doc = mode === 'glyph' ? glyphCanvas : canvas;
      if (floatingGridSelection) {
        // Already lifted (nothing's been cleared from `doc` yet — see
        // liftGridSelection) — cutting it means applying just the clear
        // half now, discarding the pending clones instead of painting them
        // back anywhere.
        set({ clipboard: snapshotGridClipboard(floatingGridSelection) });
        clearGridSelectionSource(doc, floatingGridSelection);
        pruneEmptyGridsForSelection(doc, floatingGridSelection);
        set({ selection: null, floatingGridSelection: null });
        commit();
        return;
      }
      if (floatingSelection) {
        set({ clipboard: { kind: 'flat', originRect: floatingSelectionRect(floatingSelection), width: floatingSelection.width, height: floatingSelection.height, cells: floatingSelection.cells }, selection: null, floatingSelection: null, floatingGridSelection: null });
        commit();
        return;
      }
      if (!doc || !selection) return;
      const rect = normalizeRect(selection.x0, selection.y0, selection.x1, selection.y1);
      if (doc.tier === 'advanced') {
        const fgs = liftGridSelectionModel(doc, selectionScope, rect, true);
        if (!fgs) return;
        set({ clipboard: snapshotGridClipboard(fgs) });
        clearGridSelectionSource(doc, fgs);
        pruneEmptyGridsForSelection(doc, fgs);
        set({ selection: null });
        commit();
        return;
      }
      const cells = extractSelection(doc, selectionScope, rect);
      clearSelectionRect(doc, selectionScope, rect);
      set({ clipboard: { kind: 'flat', originRect: rect, width: rect.x1 - rect.x0 + 1, height: rect.y1 - rect.y0 + 1, cells }, selection: null });
      commit();
    },
    pasteClipboard: () => {
      const { mode, clipboard, canvas, glyphCanvas } = get();
      const doc = mode === 'glyph' ? glyphCanvas : canvas;
      if (!clipboard || !doc) return;
      if (clipboard.kind === 'grid') {
        if (doc.tier !== 'advanced') return; // a Shape-tier clipboard has nothing meaningful to paste into Pixel tier/Glyph mode
        const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (!layer) return;
        const { x: targetX, y: targetY } = pastePosition(doc, clipboard);
        const dx = targetX - clipboard.originRect.x0;
        const dy = targetY - clipboard.originRect.y0;
        const clones = clipboard.clones.map((c) => ({
          originGridId: null,
          originSnapshot: null,
          grid: { ...c, id: makeGridId(), offsetX: c.offsetX + dx, offsetY: c.offsetY + dy, pixels: c.pixels.slice() },
        }));
        const fgs = { layerId: layer.id, rect: { x0: targetX, y0: targetY, x1: targetX + clipboard.width - 1, y1: targetY + clipboard.height - 1 }, clones };
        set({ activeTool: 'marqueeSelect', selection: null, floatingSelection: null, floatingGridSelection: fgs });
        return;
      }
      const { x, y } = pastePosition(doc, clipboard);
      set({ activeTool: 'marqueeSelect', selection: null, floatingGridSelection: null, floatingSelection: { x, y, width: clipboard.width, height: clipboard.height, cells: clipboard.cells } });
    },

    // --- Raster import ---
    importRasterImage: async (file, { mode = 'nearest', useExistingPalette = false, maxColors = 16 } = {}) => {
      const { canvas } = get();
      const image = await decodeImageFile(file);
      const result = importRasterToGrid(image, canvas.width, canvas.height, { mode, palette: useExistingPalette ? canvas.palette.colors : undefined, maxColors });
      for (let y = 0; y < result.height; y++) {
        for (let x = 0; x < result.width; x++) {
          const color = result.colors[y * result.width + x];
          if (color) paintCanvasCell(canvas, x, y, color);
        }
      }
      if (!useExistingPalette) {
        const merged = [...canvas.palette.colors];
        for (const color of result.palette) if (!merged.includes(color)) merged.push(color);
        canvas.palette.colors = merged;
      }
      commit();
    },
    /**
     * OS-clipboard image paste-in: decodes an external raster image (a Blob
     * from a paste event, e.g. a screenshot copied from another app)
     * through the same decode+quantize pipeline importRasterImage uses, but
     * lands it as a floating selection — matching internal paste's drop-in
     * point — instead of importRasterImage's own immediate full-canvas
     * paint+commit. Mode-aware like pasteClipboard/colorAt.
     *
     * Target size is clamped to `min(image dimension, doc dimension)` per
     * axis — a source image larger than the canvas still downsamples to
     * fit (the common "paste a screenshot" case), but a source already
     * smaller than the canvas (e.g. a small pixel-art snippet) pastes in at
     * its own native size instead of being upscaled to fill the whole
     * canvas. Passing `importRasterToGrid` the same size as the source on
     * that axis makes its nearest/average sampling an exact identity copy,
     * one image pixel per cell.
     *
     * Shape tier default (`pasteColorMode: 'multiple'`): one Grid clone per
     * distinct pasted color (buildGridClonesByColor) — a Grid is one style +
     * one bitmap, so a multi-color paste can't become a single shape without
     * losing color data. `pasteColorMode: 'single'` instead unions every
     * pasted pixel into one Grid clone painted with the active color
     * (buildGridCloneUnioned) — see docs/data-model.md's Selection section.
     */
    pasteImageBlob: async (blob) => {
      const { mode, canvas, glyphCanvas, pasteColorMode, activeColor } = get();
      const doc = mode === 'glyph' ? glyphCanvas : canvas;
      if (!doc) return;
      const image = await decodeImageFile(blob);
      const targetWidth = Math.min(image.width, doc.width);
      const targetHeight = Math.min(image.height, doc.height);
      const result = importRasterToGrid(image, targetWidth, targetHeight);
      const cells = [];
      for (let y = 0; y < result.height; y++) {
        for (let x = 0; x < result.width; x++) {
          const color = result.colors[y * result.width + x];
          if (color) cells.push({ dx: x, dy: y, color });
        }
      }
      if (cells.length === 0) return;
      const merged = [...doc.palette.colors];
      for (const color of result.palette) if (!merged.includes(color)) merged.push(color);
      doc.palette.colors = merged;
      const x = Math.max(0, Math.min(doc.width - result.width, Math.floor((doc.width - result.width) / 2)));
      const y = Math.max(0, Math.min(doc.height - result.height, Math.floor((doc.height - result.height) / 2)));
      if (doc.tier === 'advanced') {
        const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (!layer) return;
        // pasteRaw/touched, and the 'single' mode itself, only matter when
        // there's an actual choice to offer (2+ distinct colors) — with
        // exactly one pasted color, buildGridClonesByColor already produces
        // one clone at that color, which is the unambiguous right answer;
        // forcing 'single' mode's recolor-to-activeColor here would silently
        // repaint a same-color paste just because the toggle happened to be
        // left on 'single' from an earlier, different paste.
        const distinctColors = new Set(cells.map((c) => c.color)).size;
        const clones =
          pasteColorMode === 'single' && distinctColors >= 2
            ? buildGridCloneUnioned(x, y, cells, { fill: activeColor, effects: [] })
            : buildGridClonesByColor(x, y, cells);
        const fgs = {
          layerId: layer.id,
          rect: { x0: x, y0: y, x1: x + result.width - 1, y1: y + result.height - 1 },
          clones,
          ...(distinctColors >= 2 ? { pasteRaw: { x, y, cells }, touched: false } : {}),
        };
        set({
          ...(mode === 'glyph' ? { glyphCanvas: { ...doc } } : { canvas: { ...doc } }),
          activeTool: 'marqueeSelect',
          selection: null,
          floatingSelection: null,
          floatingGridSelection: fgs,
        });
        return;
      }
      set({
        ...(mode === 'glyph' ? { glyphCanvas: { ...doc } } : { canvas: { ...doc } }),
        activeTool: 'marqueeSelect',
        selection: null,
        floatingGridSelection: null,
        floatingSelection: { x, y, width: result.width, height: result.height, cells },
      });
    },

    // --- Export / project persistence ---
    copySvg: async () => {
      await copySvgToClipboard(composeLayersSvg(get().canvas));
    },
    /**
     * Builds whichever Draw-mode export artifacts are checked in the Export
     * modal into one flat {name,data,type} file list — mirroring exportFont's
     * shape exactly: more than one resulting file bundles into a single .zip
     * (createZip), a single selected format saves directly. Sprite Sheet's
     * PNG+JSON and Sprite Archive's per-frame files+JSON are pushed as
     * separate entries into this same flat list rather than pre-zipped, so
     * e.g. checking Sprite Archive alongside SVG still produces one
     * combined .zip instead of a zip-within-a-zip. Sprite Archive's PNG and
     * SVG variants are independent flags (spriteArchivePng/spriteArchiveSvg)
     * since the Export modal lets both be checked at once — their metadata
     * sidecars are named frames-png.json/frames-svg.json so they never
     * collide when both are exported together.
     *
     * `size` (already-resolved output pixel dimensions, see rasterSize.js)
     * is only consulted by the raster-format rows — svg/animatedSvg/
     * spriteArchiveSvg are vector, so they ignore it.
     *
     * @param {{svg?: boolean, png?: boolean, webp?: boolean, animatedSvg?: boolean, spriteSheet?: boolean, spriteArchivePng?: boolean, spriteArchiveSvg?: boolean, gif?: boolean, apng?: boolean}} selected
     * @param {{width: number, height: number}} size
     */
    exportDrawAssets: async (selected, size) => {
      const { canvas } = get();
      const textEncoder = new TextEncoder();
      const files = [];

      if (selected.svg) {
        files.push({ name: 'artwork.svg', data: textEncoder.encode(composeLayersSvg(canvas)), type: 'image/svg+xml' });
      }
      if (selected.png) {
        const blob = await rasterizeFrame(composeLayersSvg(canvas), size.width, size.height, 'image/png');
        files.push({ name: 'artwork.png', data: new Uint8Array(await blob.arrayBuffer()), type: 'image/png' });
      }
      if (selected.webp) {
        const blob = await rasterizeFrame(composeLayersSvg(canvas), size.width, size.height, 'image/webp');
        files.push({ name: 'artwork.webp', data: new Uint8Array(await blob.arrayBuffer()), type: 'image/webp' });
      }
      // Meaningful for any frame count, but only actually animates once frameCount > 1 (Phase 7).
      if (selected.animatedSvg) {
        files.push({ name: 'animation.svg', data: textEncoder.encode(composeAnimatedSvg(canvas)), type: 'image/svg+xml' });
      }
      if (selected.spriteSheet) {
        const { blob, metadata } = await buildSpriteSheet(canvas, size);
        files.push({ name: 'spritesheet.png', data: new Uint8Array(await blob.arrayBuffer()), type: 'image/png' });
        files.push({ name: 'spritesheet.json', data: textEncoder.encode(JSON.stringify(metadata, null, 2)), type: 'application/json' });
      }
      if (selected.spriteArchivePng) {
        const { files: archiveFiles, metadata } = await buildSpriteArchive(canvas, size);
        for (const file of archiveFiles) files.push({ ...file, type: 'image/png' });
        files.push({ name: 'frames-png.json', data: textEncoder.encode(JSON.stringify(metadata, null, 2)), type: 'application/json' });
      }
      if (selected.spriteArchiveSvg) {
        const { files: archiveFiles, metadata } = buildSpriteArchiveSvg(canvas);
        for (const file of archiveFiles) files.push({ ...file, type: 'image/svg+xml' });
        files.push({ name: 'frames-svg.json', data: textEncoder.encode(JSON.stringify(metadata, null, 2)), type: 'application/json' });
      }
      if (selected.gif) {
        const blob = await buildAnimatedGif(canvas, size);
        files.push({ name: 'animation.gif', data: new Uint8Array(await blob.arrayBuffer()), type: 'image/gif' });
      }
      if (selected.apng) {
        const blob = await buildAnimatedApng(canvas, size);
        files.push({ name: 'animation.png', data: new Uint8Array(await blob.arrayBuffer()), type: 'image/png' });
      }

      if (files.length > 1) {
        const zipBytes = createZip(files.map(({ name, data }) => ({ name, data })));
        await saveFile('artwork-export.zip', new Blob([zipBytes], { type: 'application/zip' }));
      } else if (files.length === 1) {
        const [{ name, data, type }] = files;
        await saveFile(name, new Blob([data], { type }));
      }
    },
    saveProject: async () => {
      const text = saveProjectToString(get().canvas);
      await saveFile('untitled.pixelyph', new Blob([text], { type: 'application/json' }));
      await clearAutosave();
    },
    /** Saves whichever document is currently active. */
    saveAnyProject: () => (get().mode === 'glyph' ? get().saveGlyphProject() : get().saveProject()),
    /** Opens a `.pixelyph` file and starts the matching project (kind-dispatching). */
    openAnyProject: async () => {
      if (get().projectOpen && !(await get().requestConfirm('Discard the current project and open another one?'))) return;
      const result = await openFile('.pixelyph');
      if (!result) return;
      const text = await result.blob.text();
      const doc = JSON.parse(text);
      stopPlaybackTimer();
      set({ isPlaying: false });
      if (doc.kind === 'glyph') {
        const restored = deserializeGlyphSetProject(doc);
        const h = createHistory(glyphContentSnapshot(restored));
        set({ mode: 'glyph', projectOpen: true, glyphSet: restored, canvas: buildDrawDocument(), glyphCanvas: null, activeCodepoint: null, history: h, canUndo: false, canRedo: false, selection: null, floatingSelection: null, floatingGridSelection: null });
        return;
      }
      const restored = deserializeProject(doc);
      const h = createHistory(contentSnapshot(restored));
      set({ mode: 'draw', projectOpen: true, canvas: restored, glyphSet: null, glyphCanvas: null, history: h, canUndo: false, canRedo: false, selection: null, floatingSelection: null, floatingGridSelection: null });
    },

    // --- Autosave recovery (startup screen) ---
    checkAutosaveRecovery: async () => {
      const snapshot = await readAutosave();
      return snapshot ?? null;
    },
    resumeAutosave: (doc) => {
      stopPlaybackTimer();
      set({ isPlaying: false });
      if (doc.kind === 'glyph') {
        const restored = deserializeGlyphSetProject(doc);
        const h = createHistory(glyphContentSnapshot(restored));
        set({ mode: 'glyph', projectOpen: true, glyphSet: restored, canvas: buildDrawDocument(), glyphCanvas: null, activeCodepoint: null, history: h, canUndo: false, canRedo: false });
        return;
      }
      const restored = deserializeProject(doc);
      const h = createHistory(contentSnapshot(restored));
      set({ mode: 'draw', projectOpen: true, canvas: restored, glyphSet: null, glyphCanvas: null, history: h, canUndo: false, canRedo: false });
    },
    discardAutosave: async () => {
      await clearAutosave();
    },
  };
});
