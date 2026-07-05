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
import { buildDrawDocument, buildGlyphDocument, DEFAULT_INITIAL_CHARSET_PRESET } from '../model/projectFactory.js';

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

function glyphContentSnapshot(glyphSet) {
  return { kind: glyphSet.kind, meta: glyphSet.meta, glyphs: Array.from(glyphSet.glyphs.entries()) };
}

function applyGlyphContentSnapshot(glyphSet, snapshot) {
  glyphSet.kind = snapshot.kind;
  glyphSet.meta = snapshot.meta;
  glyphSet.glyphs = new Map(snapshot.glyphs);
}

/** Read side of a selection, honoring `selectionScope` in advanced tier. */
function extractSelection(canvas, selectionScope, rect) {
  if (canvas.tier === 'advanced' && selectionScope === 'activeLayer') return extractRectFromActiveLayer(canvas, rect);
  return extractRectColors(canvas, rect);
}

/** Clear side of a selection — matches whichever scope did the reading. */
function clearSelectionRect(canvas, selectionScope, rect) {
  if (canvas.tier === 'advanced' && selectionScope === 'allVisible') {
    clearRectAllLayers(canvas, rect);
    return;
  }
  clearRect(canvas, rect);
}

const autosaveScheduler = createAutosaveScheduler();

export const useStore = create((set, get) => {
  const initialCanvas = buildDrawDocument();

  /** Swaps in a fresh `canvas` reference so subscribers re-render, without cloning the (already-mutated) nested content. */
  function touchCanvas() {
    set({ canvas: { ...get().canvas } });
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
      set({ glyphSet: { ...glyphSet }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    } else {
      pushSnapshot(history, contentSnapshot(canvas));
      set({ canvas: { ...canvas }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
      autosaveScheduler(serializeProject(canvas));
    }
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
    zoom: 16,
    pan: { x: 0, y: 0 },
    showGrid: true,
    tilePreviewOpen: false,

    selection: null,
    floatingSelection: null,
    selectionScope: 'activeLayer',

    setActiveTool: (tool) => set({ activeTool: tool }),
    setActiveColor: (color) => set({ activeColor: color }),
    setShapeFilled: (filled) => set({ shapeFilled: filled }),
    setZoom: (zoom) => set({ zoom }),
    setPan: (pan) => set({ pan }),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    toggleTilePreview: () => set((s) => ({ tilePreviewOpen: !s.tilePreviewOpen })),
    setSelectionScope: (scope) => set({ selectionScope: scope }),

    // Working-session conveniences: persisted with the project, excluded from undo.
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

    /** Mirror-aware per-cell paint — the hot pointer-drag path. Glyph mode has no symmetry, paints straight into `glyphCanvas`. */
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
    commitStroke: () => commit(),

    colorAt: (x, y) => {
      const { mode, glyphCanvas, canvas } = get();
      if (mode === 'glyph') return glyphCanvas ? colorAt(glyphCanvas, x, y) : null;
      return colorAt(canvas, x, y);
    },

    // --- Advanced tier: layers panel + per-layer style ---
    setActiveLayerId: (layerId) => {
      get().canvas.activeLayerId = layerId;
      touchCanvas();
    },
    /** Advanced-tier eyedropper: activates the topmost layer at (x, y). */
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
    setLayerProps: (layerId, patch) => {
      const layer = get().canvas.layers.find((l) => l.id === layerId);
      if (!layer) return;
      Object.assign(layer, patch);
      commit();
    },
    updateLayerStyle: (layerId, patch) => {
      const layer = get().canvas.layers.find((l) => l.id === layerId);
      if (!layer) return;
      layer.style = { ...layer.style, ...patch };
      commit();
    },
    setTier: (newTier) => {
      convertTierModel(get().canvas, newTier);
      commit();
    },

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
          glyphCanvas: activeGlyph ? glyphToCanvas(activeGlyph) : null,
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
          glyphCanvas: activeGlyph ? glyphToCanvas(activeGlyph) : null,
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

    // --- Project lifecycle (Phase 4) ---

    /**
     * Creates a new project of the given mode, resetting all document state.
     * If a project is already open, the caller should have already confirmed
     * the discard (the header button does this) — but there's a safety confirm
     * here too in case newProject is called programmatically with projectOpen true.
     */
    newProject: (mode, options = {}) => {
      if (get().projectOpen && !window.confirm('Discard the current project and start a new one?')) return;
      if (mode === 'glyph') {
        const { glyphSet, initialPreset } = buildGlyphDocument(options);
        const h = createHistory(glyphContentSnapshot(glyphSet));
        set({
          mode: 'glyph',
          projectOpen: true,
          initialCharsetPreset: initialPreset,
          canvas: buildDrawDocument(),
          glyphSet,
          glyphCanvas: null,
          activeCodepoint: null,
          history: h,
          canUndo: false,
          canRedo: false,
          selection: null,
          floatingSelection: null,
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
        });
      }
    },

    /** Called by the header "New Project" button after the user confirms discarding the current project. */
    closeProject: () => {
      set({ projectOpen: false });
    },

    // --- Glyph mode: GlyphSet operations ---

    /** Makes `codepoint` the active glyph — a working-session pointer move, not a committed action. */
    selectGlyph: (codepoint) => {
      const { glyphSet } = get();
      const glyph = glyphSet.glyphs.get(codepoint);
      set({ activeCodepoint: codepoint, glyphCanvas: glyph ? glyphToCanvas(glyph) : null });
    },
    /** Creates a new blank glyph at `codepoint` (replacing any existing one). Callers confirm before replacing. */
    assignCodepoint: (codepoint, { name } = {}) => {
      const { glyphSet, history } = get();
      const width = glyphSet.meta.defaultGlyphWidth != null
        ? glyphSet.meta.defaultGlyphWidth
        : Math.max(1, Math.round(glyphSet.meta.pixelsPerEm * 0.75));
      const glyph = createGlyph({ width, height: glyphSet.meta.pixelsPerEm, name: name ?? '' });
      setGlyphModel(glyphSet, codepoint, glyph);
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, history: { ...history }, activeCodepoint: codepoint, glyphCanvas: glyphToCanvas(glyph), canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
      autosaveScheduler(serializeGlyphSetProject(glyphSet));
    },
    /** Icon-kind sets: codepoint is auto-assigned (PUA); only the name is user-facing. */
    addIconGlyph: (name) => {
      const { glyphSet, history } = get();
      const codepoint = nextIconCodepoint(glyphSet);
      const size = glyphSet.meta.defaultGlyphWidth != null
        ? glyphSet.meta.defaultGlyphWidth
        : Math.max(1, Math.round(glyphSet.meta.pixelsPerEm));
      const glyph = createGlyph({ width: size, height: glyphSet.meta.pixelsPerEm, name });
      setGlyphModel(glyphSet, codepoint, glyph);
      pushSnapshot(history, glyphContentSnapshot(glyphSet));
      set({ glyphSet: { ...glyphSet }, history: { ...history }, activeCodepoint: codepoint, glyphCanvas: glyphToCanvas(glyph), canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
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
    renameGlyph: (codepoint, name) => {
      const { glyphSet, history } = get();
      const glyph = glyphSet.glyphs.get(codepoint);
      if (!glyph) return;
      glyph.name = name;
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
      set({ glyphSet: { ...glyphSet }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history), glyphCanvas: activeGlyph ? glyphToCanvas(activeGlyph) : null });
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
      set({ glyphSet: { ...glyphSet }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history), glyphCanvas: glyphToCanvas(glyph) });
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

    // --- Selection: marquee move/cut/copy/paste (Draw mode only) ---
    startSelection: (x, y) => set({ selection: { x0: x, y0: y, x1: x, y1: y } }),
    updateSelection: (x, y) => set((s) => (s.selection ? { selection: { ...s.selection, x1: x, y1: y } } : {})),
    clearSelection: () => set({ selection: null, floatingSelection: null }),
    selectAll: () => {
      const { canvas } = get();
      set({ activeTool: 'marqueeSelect', selection: { x0: 0, y0: 0, x1: canvas.width - 1, y1: canvas.height - 1 }, floatingSelection: null });
    },
    liftSelection: (destructive) => {
      const { canvas, selection, selectionScope } = get();
      if (!selection) return;
      const rect = normalizeRect(selection.x0, selection.y0, selection.x1, selection.y1);
      const cells = extractSelection(canvas, selectionScope, rect);
      if (destructive) clearSelectionRect(canvas, selectionScope, rect);
      set({ floatingSelection: { x: rect.x0, y: rect.y0, width: rect.x1 - rect.x0 + 1, height: rect.y1 - rect.y0 + 1, cells } });
    },
    moveFloatingSelection: (x, y) => set((s) => (s.floatingSelection ? { floatingSelection: { ...s.floatingSelection, x, y } } : {})),
    dropFloatingSelection: () => {
      const { canvas, floatingSelection } = get();
      if (!floatingSelection) return;
      pasteCells(canvas, floatingSelection.x, floatingSelection.y, floatingSelection.cells);
      set({ selection: null, floatingSelection: null });
      commit();
    },
    cancelFloatingSelection: () => {
      const { canvas, history } = get();
      applyContentSnapshot(canvas, history.stack[history.index]);
      set({ canvas: { ...canvas }, selection: null, floatingSelection: null });
    },

    clipboard: null,

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
      set({ clipboard: { width, height, cells }, selection: null, floatingSelection: { x: rect.x0, y: rect.y0, width, height, cells } });
    },
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
    pasteClipboard: () => {
      const { clipboard, canvas } = get();
      if (!clipboard) return;
      const x = Math.max(0, Math.min(canvas.width - clipboard.width, Math.floor((canvas.width - clipboard.width) / 2)));
      const y = Math.max(0, Math.min(canvas.height - clipboard.height, Math.floor((canvas.height - clipboard.height) / 2)));
      set({ activeTool: 'marqueeSelect', selection: null, floatingSelection: { x, y, width: clipboard.width, height: clipboard.height, cells: clipboard.cells } });
    },

    // --- Raster import ---
    importRasterImage: async (file, { mode = 'nearest', useExistingPalette = false, maxColors = 16 } = {}) => {
      const { canvas } = get();
      const image = await decodeImageFile(file);
      const result = importRasterToGrid(image, canvas.width, canvas.height, { mode, palette: useExistingPalette ? canvas.palette : undefined, maxColors });
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
    /** Saves whichever document is currently active. */
    saveAnyProject: () => (get().mode === 'glyph' ? get().saveGlyphProject() : get().saveProject()),
    /** Opens a `.pixelyph` file and starts the matching project (kind-dispatching). */
    openAnyProject: async () => {
      const result = await openFile('.pixelyph');
      if (!result) return;
      const text = await result.blob.text();
      const doc = JSON.parse(text);
      if (doc.kind === 'glyph') {
        const restored = deserializeGlyphSetProject(doc);
        const h = createHistory(glyphContentSnapshot(restored));
        set({ mode: 'glyph', projectOpen: true, glyphSet: restored, canvas: buildDrawDocument(), glyphCanvas: null, activeCodepoint: null, history: h, canUndo: false, canRedo: false, selection: null, floatingSelection: null });
        return;
      }
      const restored = deserializeProject(doc);
      const h = createHistory(contentSnapshot(restored));
      set({ mode: 'draw', projectOpen: true, canvas: restored, glyphSet: null, glyphCanvas: null, history: h, canUndo: false, canRedo: false, selection: null, floatingSelection: null });
    },

    // --- Autosave recovery (startup screen) ---
    checkAutosaveRecovery: async () => {
      const snapshot = await readAutosave();
      return snapshot ?? null;
    },
    resumeAutosave: (doc) => {
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
