// Wraps model/ for the UI. `canvas` is a plain mutable object (not the
// usual zustand-immutable-update pattern) — model functions mutate it in
// place, and this file swaps in a fresh top-level `{ ...canvas }` reference
// only when React actually needs to notice (see `commit()`). That split
// matters for the pointer-drag hot path: `paintCellLive` mutates without
// calling `set()` at all, so a freehand stroke doesn't trigger a React
// render per cell — SvgPixelEditor pushes the recomputed `d` straight to
// the DOM via a ref instead, and `commit()` only runs once, on pointer-up.

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
  clampActiveLayer,
  topVisibleLayerAt,
  convertTier as convertTierModel,
} from '../model/Canvas.js';
import { mirrorPoints } from '../model/mirror.js';
import { createHistory, pushSnapshot, undo as historyUndo, redo as historyRedo, canUndo as historyCanUndo, canRedo as historyCanRedo } from '../model/history.js';
import { normalizeRect, extractRectColors, extractRectFromActiveLayer, clearRect, clearRectAllLayers, pasteCells } from '../model/selection.js';
import { parseLospecPalette } from '../model/paletteImport.js';
import { importRasterToGrid } from '../model/importRaster.js';
import { decodeImageFile } from '../io/imageDecode.js';
import { composeLayersSvg } from '../export/svg/composeLayersSvg.js';
import { rasterizeFrame } from '../export/raster/rasterizeFrame.js';
import { copySvgToClipboard } from '../export/clipboard.js';
import { serializeProject, deserializeProject, saveProjectToString, loadProjectFromString, serializeGlyphSetProject, deserializeGlyphSetProject, saveGlyphProjectToString, loadGlyphProjectFromString } from '../io/projectFile.js';
import { saveFile, openFile } from '../io/platform.js';
import { readAutosave, clearAutosave, createAutosaveScheduler } from '../io/autosave.js';
import { createGlyphSet, createGlyph, setGlyph as setGlyphModel, removeGlyph as removeGlyphModel, nextIconCodepoint, resizeGlyphSet as resizeGlyphSetModel, glyphToCanvas, canvasToGlyphPixels } from '../model/GlyphSet.js';
import { resize as resizeGrid } from '../model/Grid.js';
import { glyphToSvg } from '../export/svg/glyphSvg.js';

const DEFAULT_WIDTH = 16;
const DEFAULT_HEIGHT = 16;
const DEFAULT_PALETTE = ['#000000', '#ffffff', '#7f2b2b', '#2b6f39', '#2b4d7f', '#e0b04d'];

function contentSnapshot(canvas) {
  return { layers: canvas.layers, width: canvas.width, height: canvas.height, palette: canvas.palette, tier: canvas.tier };
}

function applyContentSnapshot(canvas, snapshot) {
  canvas.layers = snapshot.layers;
  canvas.width = snapshot.width;
  canvas.height = snapshot.height;
  canvas.palette = snapshot.palette;
  canvas.tier = snapshot.tier;
  // simpleTier.colorToLayerId is bookkeeping, not artwork — rebuild it from
  // the restored layers so it can't fall out of sync with what undo/redo just restored.
  canvas.simpleTier.colorToLayerId = new Map(canvas.layers.filter((l) => l.autoManaged).map((l) => [l.autoColor, l.id]));
  // activeLayerId is excluded from snapshots (a working-session concern,
  // not artwork), so a restored `layers` array might no longer contain it.
  clampActiveLayer(canvas);
}

/**
 * The undoable content of a GlyphSet — everything except `id` (stable
 * document identity, not artwork) and the working-session `activeCodepoint`
 * pointer (kept in the store, like Canvas.activeLayerId, not the snapshot).
 * `glyphs` is snapshotted as an array of entries rather than the live Map so
 * it matches the plain-data shape history.js's own generic test documents,
 * though structuredClone (which pushSnapshot/undo/redo use) would clone a
 * Map just as well.
 */
function glyphContentSnapshot(glyphSet) {
  return { kind: glyphSet.kind, meta: glyphSet.meta, glyphs: Array.from(glyphSet.glyphs.entries()) };
}

function applyGlyphContentSnapshot(glyphSet, snapshot) {
  glyphSet.kind = snapshot.kind;
  glyphSet.meta = snapshot.meta;
  glyphSet.glyphs = new Map(snapshot.glyphs);
}

/** Read side of a selection, honoring `selectionScope` in advanced tier (simple tier only ever has one meaningful reading). */
function extractSelection(canvas, selectionScope, rect) {
  if (canvas.tier === 'advanced' && selectionScope === 'activeLayer') return extractRectFromActiveLayer(canvas, rect);
  return extractRectColors(canvas, rect);
}

/** Clear side of a selection — has to match whichever scope did the reading, so a multi-layer selection doesn't leave orphaned content on layers extractSelection pulled from but this left untouched. */
function clearSelectionRect(canvas, selectionScope, rect) {
  if (canvas.tier === 'advanced' && selectionScope === 'allVisible') {
    clearRectAllLayers(canvas, rect);
    return;
  }
  clearRect(canvas, rect);
}

const autosaveScheduler = createAutosaveScheduler();

export const useStore = create((set, get) => {
  const initialCanvas = createCanvas({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, palette: DEFAULT_PALETTE });

  /** Swaps in a fresh `canvas` reference so subscribers re-render, without cloning the (already-mutated) nested content. */
  function touchCanvas() {
    set({ canvas: { ...get().canvas } });
  }

  /** One committed action: push a history snapshot, sync React, schedule autosave. Called once per finished stroke/fill/paste/resize/palette change. */
  function commit() {
    const { canvas, history } = get();
    pushSnapshot(history, contentSnapshot(canvas));
    set({ canvas: { ...canvas }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
    autosaveScheduler(serializeProject(canvas));
  }

  /**
   * Glyph mode's equivalent of commit(): reads the active glyph's pixels
   * back out of `glyphCanvas` (see GlyphSet.canvasToGlyphPixels — the
   * pseudo-canvas's auto layer may have been recreated with a fresh
   * Uint8Array mid-stroke, so this can't rely on reference identity),
   * pushes one snapshot of the *whole* GlyphSet onto glyphHistory (matching
   * how Draw mode's history snapshots the whole multi-layer Canvas, not
   * just the one layer being painted), and schedules the same debounced
   * autosave Draw mode uses.
   */
  function commitGlyph() {
    const { glyphSet, glyphCanvas, activeCodepoint, glyphHistory } = get();
    if (!glyphCanvas || activeCodepoint == null) return;
    const glyph = glyphSet.glyphs.get(activeCodepoint);
    if (!glyph) return;
    glyph.pixels = canvasToGlyphPixels(glyphCanvas);
    pushSnapshot(glyphHistory, glyphContentSnapshot(glyphSet));
    set({ glyphSet: { ...glyphSet }, glyphHistory: { ...glyphHistory }, canUndo: historyCanUndo(glyphHistory), canRedo: historyCanRedo(glyphHistory) });
    autosaveScheduler(serializeGlyphSetProject(glyphSet));
  }

  /** Re-derives canUndo/canRedo from whichever mode's history is currently active — needed on every mode switch, since Toolbar's undo/redo buttons read these two shared fields regardless of mode. */
  function refreshUndoRedoFlags() {
    const { mode, history, glyphHistory } = get();
    const active = mode === 'glyph' ? glyphHistory : history;
    set({ canUndo: active ? historyCanUndo(active) : false, canRedo: active ? historyCanRedo(active) : false });
  }

  return {
    canvas: initialCanvas,
    history: createHistory(contentSnapshot(initialCanvas)),
    canUndo: false,
    canRedo: false,

    // --- Glyph mode: a separate document from Draw mode's canvas, kept
    // alongside it (not replacing `canvas`) so switching modes never loses
    // work in either. `glyphCanvas` is the active glyph re-wrapped as a
    // single-color 'simple'-tier pseudo-Canvas (GlyphSet.glyphToCanvas) so
    // SvgPixelEditor/tools/paintCell need no glyph-specific logic at all —
    // see GlyphSet.js's file header.
    mode: 'draw', // 'draw' | 'glyph'
    glyphSet: null,
    glyphHistory: null,
    glyphCanvas: null,
    activeCodepoint: null, // working-session pointer, like activeLayerId — not part of glyphHistory snapshots

    activeTool: 'pencil',
    activeColor: DEFAULT_PALETTE[0],
    shapeFilled: false,
    zoom: 16,
    pan: { x: 0, y: 0 },
    showGrid: true,
    tilePreviewOpen: false,

    selection: null, // { x0, y0, x1, y1 } canvas-space, normalized
    floatingSelection: null, // { x, y, width, height, cells: [{dx,dy,color}] }
    // Advanced tier only (simple tier has no "other layers" to be ambiguous
    // about): whether copy/cut read from just the active layer, or from
    // whichever visible layer is topmost at each cell. 'activeLayer' is the
    // safer default — it can't silently pull in content from a layer you
    // didn't mean to touch. See selection.js's file header for how this
    // affects both the read and the matching clear step.
    selectionScope: 'activeLayer',

    setActiveTool: (tool) => set({ activeTool: tool }),
    setActiveColor: (color) => set({ activeColor: color }),
    setShapeFilled: (filled) => set({ shapeFilled: filled }),
    setZoom: (zoom) => set({ zoom }),
    setPan: (pan) => set({ pan }),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    toggleTilePreview: () => set((s) => ({ tilePreviewOpen: !s.tilePreviewOpen })),
    setSelectionScope: (scope) => set({ selectionScope: scope }),

    // Working-session conveniences (Canvas.symmetryMode, Canvas.referenceImage):
    // persisted with the project, but deliberately excluded from undo — touch
    // the canvas and re-render, but never push a history snapshot.
    setSymmetryMode: (mode) => {
      get().canvas.symmetryMode = mode;
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

    /** Mirror-aware per-cell paint, mutating in place with no React render — the hot pointer-drag path. Glyph mode has no symmetry concept, so it paints straight into `glyphCanvas` with no mirroring. */
    paintCellLive: (x, y, color) => {
      const { mode, glyphCanvas } = get();
      if (mode === 'glyph') {
        if (glyphCanvas) paintCanvasCell(glyphCanvas, x, y, color);
        return;
      }
      const { canvas } = get();
      for (const p of mirrorPoints(canvas.width, canvas.height, x, y, canvas.symmetryMode)) {
        paintCanvasCell(canvas, p.x, p.y, color);
      }
    },
    /** Call once per finished stroke/fill/paste (pointer-up), not per cell. */
    commitStroke: () => (get().mode === 'glyph' ? commitGlyph() : commit()),

    colorAt: (x, y) => {
      const { mode, glyphCanvas, canvas } = get();
      if (mode === 'glyph') return glyphCanvas ? colorAt(glyphCanvas, x, y) : null;
      return colorAt(canvas, x, y);
    },

    // --- Advanced tier: layers panel + per-layer style ---
    // activeLayerId is a working-session pointer like symmetryMode/referenceImage
    // above: touched (not committed) when just switching which layer is
    // selected, but committed as part of the same action for anything that
    // actually changes document content (add/remove/reorder/style/offset).
    setActiveLayerId: (layerId) => {
      get().canvas.activeLayerId = layerId;
      touchCanvas();
    },
    /** Advanced-tier eyedropper: activates the topmost layer at (x, y) rather than sampling a color (ambiguous once gradients exist). */
    selectTopLayerAt: (x, y) => {
      const { canvas } = get();
      const layer = topVisibleLayerAt(canvas, x, y);
      if (!layer) return;
      canvas.activeLayerId = layer.id;
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
    /** Merges `layerId` into the layer below it; no-ops if it's already the bottom-most layer. */
    mergeLayerDown: (layerId) => {
      mergeLayerDownModel(get().canvas, layerId);
      commit();
    },
    setLayerOffset: (layerId, x, y) => {
      const layer = get().canvas.layers.find((l) => l.id === layerId);
      if (!layer) return;
      layer.offset = { x, y };
      commit();
    },
    /** Patches any of visible/locked/opacity/name — one committed action per call, matching the "a style change" granularity history.js already documents. */
    setLayerProps: (layerId, patch) => {
      const layer = get().canvas.layers.find((l) => l.id === layerId);
      if (!layer) return;
      Object.assign(layer, patch);
      commit();
    },
    /** Patches `layer.style` (fill/stroke/effects) — see LayerStylePanel. */
    updateLayerStyle: (layerId, patch) => {
      const layer = get().canvas.layers.find((l) => l.id === layerId);
      if (!layer) return;
      layer.style = { ...layer.style, ...patch };
      commit();
    },
    /** Simple -> advanced is always safe; advanced -> simple is potentially lossy — callers should confirm first (see convertTier). */
    setTier: (newTier) => {
      convertTierModel(get().canvas, newTier);
      commit();
    },

    undo: () => {
      if (get().mode === 'glyph') {
        const { glyphSet, glyphHistory, activeCodepoint } = get();
        const snapshot = historyUndo(glyphHistory);
        if (!snapshot) return;
        applyGlyphContentSnapshot(glyphSet, snapshot);
        const activeGlyph = activeCodepoint != null ? glyphSet.glyphs.get(activeCodepoint) : null;
        set({
          glyphSet: { ...glyphSet },
          glyphHistory: { ...glyphHistory },
          glyphCanvas: activeGlyph ? glyphToCanvas(activeGlyph) : null,
          canUndo: historyCanUndo(glyphHistory),
          canRedo: historyCanRedo(glyphHistory),
        });
        autosaveScheduler(serializeGlyphSetProject(glyphSet));
        return;
      }
      const { canvas, history } = get();
      const snapshot = historyUndo(history);
      if (!snapshot) return;
      applyContentSnapshot(canvas, snapshot);
      set({ canvas: { ...canvas }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
      autosaveScheduler(serializeProject(canvas));
    },
    redo: () => {
      if (get().mode === 'glyph') {
        const { glyphSet, glyphHistory, activeCodepoint } = get();
        const snapshot = historyRedo(glyphHistory);
        if (!snapshot) return;
        applyGlyphContentSnapshot(glyphSet, snapshot);
        const activeGlyph = activeCodepoint != null ? glyphSet.glyphs.get(activeCodepoint) : null;
        set({
          glyphSet: { ...glyphSet },
          glyphHistory: { ...glyphHistory },
          glyphCanvas: activeGlyph ? glyphToCanvas(activeGlyph) : null,
          canUndo: historyCanUndo(glyphHistory),
          canRedo: historyCanRedo(glyphHistory),
        });
        autosaveScheduler(serializeGlyphSetProject(glyphSet));
        return;
      }
      const { canvas, history } = get();
      const snapshot = historyRedo(history);
      if (!snapshot) return;
      applyContentSnapshot(canvas, snapshot);
      set({ canvas: { ...canvas }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
      autosaveScheduler(serializeProject(canvas));
    },

    resizeCanvas: (newWidth, newHeight, anchor) => {
      resizeCanvasModel(get().canvas, newWidth, newHeight, anchor);
      commit();
    },

    setPalette: (colors) => {
      get().canvas.palette = colors;
      commit();
    },
    importLospecPalette: (text) => {
      const colors = parseLospecPalette(text);
      if (colors.length === 0) return;
      get().canvas.palette = colors;
      commit();
    },

    // --- Glyph mode: GlyphSet document, separate from Draw mode's `canvas`
    // (both are kept in memory at once so switching modes never loses
    // work). Content-mutating actions here mirror Draw mode's granularity:
    // one commit (history snapshot + autosave) per finished user action —
    // create/replace a glyph, remove one, edit font metadata, resize.
    /** Switches which document SvgPixelEditor/Toolbar operate on. Lazily starts a blank characters GlyphSet the first time glyph mode is entered. */
    setMode: (mode) => {
      if (mode === get().mode) return;
      if (mode === 'glyph' && !get().glyphSet) {
        get().newGlyphProject('characters');
        return; // newGlyphProject already sets mode and refreshes undo/redo flags
      }
      set({ mode });
      refreshUndoRedoFlags();
    },
    /** Starts a fresh GlyphSet of `kind`, discarding any glyph work in progress — callers should confirm first if one already exists (same destructive-action pattern as the Draw-mode tier toggle). */
    newGlyphProject: (kind = 'characters') => {
      const glyphSet = createGlyphSet({ kind });
      set({ mode: 'glyph', glyphSet, glyphHistory: createHistory(glyphContentSnapshot(glyphSet)), activeCodepoint: null, glyphCanvas: null });
      refreshUndoRedoFlags();
    },
    /** Makes `codepoint` the active glyph (or clears the editor if it has no glyph yet) — a working-session pointer move, not a committed action. */
    selectGlyph: (codepoint) => {
      const { glyphSet } = get();
      const glyph = glyphSet.glyphs.get(codepoint);
      set({ activeCodepoint: codepoint, glyphCanvas: glyph ? glyphToCanvas(glyph) : null });
    },
    /**
     * Creates a new blank glyph at `codepoint` (replacing any existing one)
     * and makes it active — the character-map "type a character/U+XXXX to
     * assign" flow. Whether replacing an existing glyph needs confirming is
     * the caller's job (see GlyphSet.wouldCollide), same division of labor
     * as Draw mode's tier-toggle confirm living in Toolbar, not the store.
     */
    assignCodepoint: (codepoint, { name } = {}) => {
      const { glyphSet, glyphHistory } = get();
      const width = Math.max(1, Math.round(glyphSet.meta.pixelsPerEm * 0.75));
      const glyph = createGlyph({ width, height: glyphSet.meta.pixelsPerEm, name: name ?? '' });
      setGlyphModel(glyphSet, codepoint, glyph);
      pushSnapshot(glyphHistory, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, glyphHistory: { ...glyphHistory }, activeCodepoint: codepoint, glyphCanvas: glyphToCanvas(glyph) });
      refreshUndoRedoFlags();
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    /** Icon-kind sets skip codepoint typing entirely — the codepoint is an internal PUA slot the user never sees (GlyphSet.nextIconCodepoint); only the name is user-facing. */
    addIconGlyph: (name) => {
      const { glyphSet, glyphHistory } = get();
      const codepoint = nextIconCodepoint(glyphSet);
      const size = Math.max(1, Math.round(glyphSet.meta.pixelsPerEm));
      const glyph = createGlyph({ width: size, height: glyphSet.meta.pixelsPerEm, name });
      setGlyphModel(glyphSet, codepoint, glyph);
      pushSnapshot(glyphHistory, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, glyphHistory: { ...glyphHistory }, activeCodepoint: codepoint, glyphCanvas: glyphToCanvas(glyph) });
      refreshUndoRedoFlags();
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    removeGlyphAction: (codepoint) => {
      const { glyphSet, glyphHistory, activeCodepoint } = get();
      removeGlyphModel(glyphSet, codepoint);
      pushSnapshot(glyphHistory, glyphContentSnapshot(glyphSet));
      set({
        glyphSet: { ...glyphSet },
        glyphHistory: { ...glyphHistory },
        ...(activeCodepoint === codepoint ? { activeCodepoint: null, glyphCanvas: null } : {}),
      });
      refreshUndoRedoFlags();
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    /** Icon-kind glyphs are identified by name, not codepoint — see CharacterMapPanel vs GlyphSetPanel's icon-add affordance. */
    renameGlyph: (codepoint, name) => {
      const { glyphSet, glyphHistory } = get();
      const glyph = glyphSet.glyphs.get(codepoint);
      if (!glyph) return;
      glyph.name = name;
      pushSnapshot(glyphHistory, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, glyphHistory: { ...glyphHistory } });
      refreshUndoRedoFlags();
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    /** Patches any FontMeta field (familyName/styleName/unitsPerEm/ascender/descender/baselineRow/iconTilePadding). `pixelsPerEm` is the one exception — see resizeFontPixelsPerEm, which also touches every glyph's grid. */
    updateFontMeta: (patch) => {
      const { glyphSet, glyphHistory } = get();
      glyphSet.meta = { ...glyphSet.meta, ...patch };
      pushSnapshot(glyphHistory, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, glyphHistory: { ...glyphHistory } });
      refreshUndoRedoFlags();
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    /** Crops/pads every glyph's grid to a new uniform height (GlyphSet.resizeGlyphSet) — potentially lossy, callers should confirm first (see FontMetadataPanel). */
    resizeFontPixelsPerEm: (newPixelsPerEm, anchor = 'top-left') => {
      const { glyphSet, glyphHistory, activeCodepoint } = get();
      resizeGlyphSetModel(glyphSet, newPixelsPerEm, anchor);
      pushSnapshot(glyphHistory, glyphContentSnapshot(glyphSet));
      const activeGlyph = activeCodepoint != null ? glyphSet.glyphs.get(activeCodepoint) : null;
      set({ glyphSet: { ...glyphSet }, glyphHistory: { ...glyphHistory }, glyphCanvas: activeGlyph ? glyphToCanvas(activeGlyph) : null });
      refreshUndoRedoFlags();
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    /** Resizes just the active glyph's width (height stays font-wide via pixelsPerEm) — the per-glyph analogue of Draw mode's CanvasSizeControl. */
    resizeActiveGlyph: (newWidth, anchor = 'top-left') => {
      const { glyphSet, glyphHistory, activeCodepoint } = get();
      if (activeCodepoint == null) return;
      const glyph = glyphSet.glyphs.get(activeCodepoint);
      if (!glyph) return;
      glyph.pixels = resizeGrid(glyph, newWidth, glyph.height, anchor).pixels;
      glyph.width = newWidth;
      glyph.advanceWidth = newWidth;
      pushSnapshot(glyphHistory, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, glyphHistory: { ...glyphHistory }, glyphCanvas: glyphToCanvas(glyph) });
      refreshUndoRedoFlags();
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },

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
    openGlyphProject: async () => {
      const result = await openFile('.pixelyph');
      if (!result) return;
      const text = await result.blob.text();
      const restored = loadGlyphProjectFromString(text);
      set({ mode: 'glyph', glyphSet: restored, glyphHistory: createHistory(glyphContentSnapshot(restored)), activeCodepoint: null, glyphCanvas: null });
      refreshUndoRedoFlags();
    },

    // --- Selection: marquee move/cut/copy/paste ---
    startSelection: (x, y) => set({ selection: { x0: x, y0: y, x1: x, y1: y } }),
    updateSelection: (x, y) => set((s) => (s.selection ? { selection: { ...s.selection, x1: x, y1: y } } : {})),
    clearSelection: () => set({ selection: null, floatingSelection: null }),
    /** Ctrl+A: selects the whole canvas. Switches to the select tool so the result is immediately visible/actionable. */
    selectAll: () => {
      const { canvas } = get();
      set({ activeTool: 'marqueeSelect', selection: { x0: 0, y0: 0, x1: canvas.width - 1, y1: canvas.height - 1 }, floatingSelection: null });
    },

    /** Lifts the current selection into a floating buffer. `destructive: true` (move) clears the source; false (copy) leaves it. */
    liftSelection: (destructive) => {
      const { canvas, selection, selectionScope } = get();
      if (!selection) return;
      const rect = normalizeRect(selection.x0, selection.y0, selection.x1, selection.y1);
      const cells = extractSelection(canvas, selectionScope, rect);
      if (destructive) clearSelectionRect(canvas, selectionScope, rect);
      set({
        floatingSelection: { x: rect.x0, y: rect.y0, width: rect.x1 - rect.x0 + 1, height: rect.y1 - rect.y0 + 1, cells },
      });
    },
    moveFloatingSelection: (x, y) => set((s) => (s.floatingSelection ? { floatingSelection: { ...s.floatingSelection, x, y } } : {})),
    /** Paints the floating buffer back in at its current position — one committed action (a "paste"). */
    dropFloatingSelection: () => {
      const { canvas, floatingSelection } = get();
      if (!floatingSelection) return;
      pasteCells(canvas, floatingSelection.x, floatingSelection.y, floatingSelection.cells);
      set({ selection: null, floatingSelection: null });
      commit();
    },
    /** Discards an in-progress move/copy without committing — reverts to the last committed snapshot. */
    cancelFloatingSelection: () => {
      const { canvas, history } = get();
      applyContentSnapshot(canvas, history.stack[history.index]);
      set({ canvas: { ...canvas }, selection: null, floatingSelection: null });
    },

    clipboard: null, // { width, height, cells } — app-internal, not the system clipboard; Ctrl+C/X/V below

    /**
     * Copies the current selection's cells to the clipboard and, for a
     * plain (not-yet-lifted) selection, immediately turns it into a
     * floating copy sitting exactly where the selection was — the same
     * non-destructive lift a shift+drag already does, just without
     * requiring the drag. That copy is then draggable/committable like any
     * other floating selection (Enter/Escape/click-outside). If a floating
     * selection is already in progress, copying just refreshes the
     * clipboard from its current cells — there's no separate "selection"
     * left to drop in that case.
     */
    copySelection: () => {
      const { canvas, selection, floatingSelection, selectionScope } = get();
      if (floatingSelection) {
        set({ clipboard: { width: floatingSelection.width, height: floatingSelection.height, cells: floatingSelection.cells } });
        return;
      }
      if (!selection) return;
      const rect = normalizeRect(selection.x0, selection.y0, selection.x1, selection.y1);
      const width = rect.x1 - rect.x0 + 1;
      const height = rect.y1 - rect.y0 + 1;
      const cells = extractSelection(canvas, selectionScope, rect);
      set({
        clipboard: { width, height, cells },
        selection: null,
        floatingSelection: { x: rect.x0, y: rect.y0, width, height, cells },
      });
    },
    /** Copies then clears the selection. If a floating move is already in progress, this just finalizes it in place without pasting the buffer back (abandoning the move) — the earlier lift already cleared the source if it was destructive. */
    cutSelection: () => {
      const { canvas, selection, floatingSelection, selectionScope } = get();
      if (floatingSelection) {
        set({ clipboard: { width: floatingSelection.width, height: floatingSelection.height, cells: floatingSelection.cells }, selection: null, floatingSelection: null });
        commit();
        return;
      }
      if (!selection) return;
      const rect = normalizeRect(selection.x0, selection.y0, selection.x1, selection.y1);
      const cells = extractSelection(canvas, selectionScope, rect);
      clearSelectionRect(canvas, selectionScope, rect);
      set({ clipboard: { width: rect.x1 - rect.x0 + 1, height: rect.y1 - rect.y0 + 1, cells }, selection: null });
      commit();
    },
    /** Drops the clipboard's contents back in as a new floating selection, positioned where it was lifted from, ready to move like any other lift. Switches to the select tool so it's immediately draggable. */
    pasteClipboard: () => {
      const { clipboard, canvas } = get();
      if (!clipboard) return;
      const x = Math.max(0, Math.min(canvas.width - clipboard.width, Math.floor((canvas.width - clipboard.width) / 2)));
      const y = Math.max(0, Math.min(canvas.height - clipboard.height, Math.floor((canvas.height - clipboard.height) / 2)));
      set({
        activeTool: 'marqueeSelect',
        selection: null,
        floatingSelection: { x, y, width: clipboard.width, height: clipboard.height, cells: clipboard.cells },
      });
    },

    // --- Raster import: file -> RGBA -> downsample/quantize -> paintCell per cell ---
    /** @param {File} file @param {{ mode?: 'nearest'|'average', useExistingPalette?: boolean, maxColors?: number }} [options] */
    importRasterImage: async (file, { mode = 'nearest', useExistingPalette = false, maxColors = 16 } = {}) => {
      const { canvas } = get();
      const image = await decodeImageFile(file);
      const result = importRasterToGrid(image, canvas.width, canvas.height, {
        mode,
        palette: useExistingPalette ? canvas.palette : undefined,
        maxColors,
      });
      for (let y = 0; y < result.height; y++) {
        for (let x = 0; x < result.width; x++) {
          const color = result.colors[y * result.width + x];
          if (color) paintCanvasCell(canvas, x, y, color);
        }
      }
      if (!useExistingPalette) {
        const merged = [...canvas.palette];
        for (const color of result.palette) if (!merged.includes(color)) merged.push(color);
        canvas.palette = merged;
      }
      commit();
    },

    // --- Export / project persistence ---
    exportSvg: async () => {
      const svg = composeLayersSvg(get().canvas);
      await saveFile('artwork.svg', new Blob([svg], { type: 'image/svg+xml' }));
    },
    exportRaster: async (format, scale) => {
      const { canvas } = get();
      const svg = composeLayersSvg(canvas);
      const mimeType = format === 'webp' ? 'image/webp' : 'image/png';
      const blob = await rasterizeFrame(svg, canvas.width, canvas.height, scale, mimeType);
      await saveFile(`artwork.${format}`, blob);
    },
    copySvg: async () => {
      await copySvgToClipboard(composeLayersSvg(get().canvas));
    },
    saveProject: async () => {
      const text = saveProjectToString(get().canvas);
      await saveFile('untitled.pixelyph', new Blob([text], { type: 'application/json' }));
      await clearAutosave();
    },
    openProject: async () => {
      const result = await openFile('.pixelyph');
      if (!result) return;
      const text = await result.blob.text();
      const restored = loadProjectFromString(text);
      set({ mode: 'draw', canvas: restored, history: createHistory(contentSnapshot(restored)), canUndo: false, canRedo: false, selection: null, floatingSelection: null });
    },
    /** Saves whichever document is currently active — the header's single Save button works regardless of mode. */
    saveAnyProject: () => (get().mode === 'glyph' ? get().saveGlyphProject() : get().saveProject()),
    /** Opens a `.pixelyph` file and switches to whichever mode its `kind` implies, regardless of which mode was active before — so "Open" always works no matter what's currently on screen. */
    openAnyProject: async () => {
      const result = await openFile('.pixelyph');
      if (!result) return;
      const text = await result.blob.text();
      const doc = JSON.parse(text);
      if (doc.kind === 'glyph') {
        const restored = deserializeGlyphSetProject(doc);
        set({ mode: 'glyph', glyphSet: restored, glyphHistory: createHistory(glyphContentSnapshot(restored)), activeCodepoint: null, glyphCanvas: null, selection: null, floatingSelection: null });
        refreshUndoRedoFlags();
        return;
      }
      const restored = deserializeProject(doc);
      set({ mode: 'draw', canvas: restored, history: createHistory(contentSnapshot(restored)), canUndo: false, canRedo: false, selection: null, floatingSelection: null });
    },

    // --- Autosave recovery prompt (single active project, v1 scope) ---
    checkAutosaveRecovery: async () => {
      const snapshot = await readAutosave();
      return snapshot ?? null;
    },
    resumeAutosave: (doc) => {
      if (doc.kind === 'glyph') {
        const restored = deserializeGlyphSetProject(doc);
        set({ mode: 'glyph', glyphSet: restored, glyphHistory: createHistory(glyphContentSnapshot(restored)), activeCodepoint: null, glyphCanvas: null, canUndo: false, canRedo: false });
        return;
      }
      const restored = deserializeProject(doc);
      set({ mode: 'draw', canvas: restored, history: createHistory(contentSnapshot(restored)), canUndo: false, canRedo: false });
    },
    discardAutosave: async () => {
      await clearAutosave();
    },
  };
});
