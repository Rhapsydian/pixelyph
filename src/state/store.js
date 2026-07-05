// Wraps model/ for the UI. `canvas` is a plain mutable object (not the
// usual zustand-immutable-update pattern) — model functions mutate it in
// place, and this file swaps in a fresh top-level `{ ...canvas }` reference
// only when React actually needs to notice (see `commit()`). That split
// matters for the pointer-drag hot path: `paintCellLive` mutates without
// calling `set()` at all, so a freehand stroke doesn't trigger a React
// render per cell — SvgPixelEditor pushes the recomputed `d` straight to
// the DOM via a ref instead, and `commit()` only runs once, on pointer-up.

import { create } from 'zustand';
import { createCanvas, paintCell as paintCanvasCell, resizeCanvas as resizeCanvasModel, colorAt } from '../model/Canvas.js';
import { mirrorPoints } from '../model/mirror.js';
import { createHistory, pushSnapshot, undo as historyUndo, redo as historyRedo, canUndo as historyCanUndo, canRedo as historyCanRedo } from '../model/history.js';
import { normalizeRect, extractRectColors, clearRect, pasteCells } from '../model/selection.js';
import { parseLospecPalette } from '../model/paletteImport.js';
import { importRasterToGrid } from '../model/importRaster.js';
import { decodeImageFile } from '../io/imageDecode.js';
import { composeLayersSvg } from '../export/svg/composeLayersSvg.js';
import { rasterizeFrame } from '../export/raster/rasterizeFrame.js';
import { copySvgToClipboard } from '../export/clipboard.js';
import { serializeProject, deserializeProject, saveProjectToString, loadProjectFromString } from '../io/projectFile.js';
import { saveFile, openFile } from '../io/platform.js';
import { readAutosave, clearAutosave, createAutosaveScheduler } from '../io/autosave.js';

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

  return {
    canvas: initialCanvas,
    history: createHistory(contentSnapshot(initialCanvas)),
    canUndo: false,
    canRedo: false,

    activeTool: 'pencil',
    activeColor: DEFAULT_PALETTE[0],
    shapeFilled: false,
    zoom: 16,
    pan: { x: 0, y: 0 },
    showGrid: true,
    tilePreviewOpen: false,

    selection: null, // { x0, y0, x1, y1 } canvas-space, normalized
    floatingSelection: null, // { x, y, width, height, cells: [{dx,dy,color}] }

    setActiveTool: (tool) => set({ activeTool: tool }),
    setActiveColor: (color) => set({ activeColor: color }),
    setShapeFilled: (filled) => set({ shapeFilled: filled }),
    setZoom: (zoom) => set({ zoom }),
    setPan: (pan) => set({ pan }),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    toggleTilePreview: () => set((s) => ({ tilePreviewOpen: !s.tilePreviewOpen })),

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

    /** Mirror-aware per-cell paint, mutating in place with no React render — the hot pointer-drag path. */
    paintCellLive: (x, y, color) => {
      const { canvas } = get();
      for (const p of mirrorPoints(canvas.width, canvas.height, x, y, canvas.symmetryMode)) {
        paintCanvasCell(canvas, p.x, p.y, color);
      }
    },
    /** Call once per finished stroke/fill/paste (pointer-up), not per cell. */
    commitStroke: () => commit(),

    colorAt: (x, y) => colorAt(get().canvas, x, y),

    undo: () => {
      const { canvas, history } = get();
      const snapshot = historyUndo(history);
      if (!snapshot) return;
      applyContentSnapshot(canvas, snapshot);
      set({ canvas: { ...canvas }, history: { ...history }, canUndo: historyCanUndo(history), canRedo: historyCanRedo(history) });
      autosaveScheduler(serializeProject(canvas));
    },
    redo: () => {
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

    // --- Selection: marquee move/cut/copy/paste ---
    startSelection: (x, y) => set({ selection: { x0: x, y0: y, x1: x, y1: y } }),
    updateSelection: (x, y) => set((s) => (s.selection ? { selection: { ...s.selection, x1: x, y1: y } } : {})),
    clearSelection: () => set({ selection: null, floatingSelection: null }),

    /** Lifts the current selection into a floating buffer. `destructive: true` (move) clears the source; false (copy) leaves it. */
    liftSelection: (destructive) => {
      const { canvas, selection } = get();
      if (!selection) return;
      const rect = normalizeRect(selection.x0, selection.y0, selection.x1, selection.y1);
      const cells = extractRectColors(canvas, rect);
      if (destructive) clearRect(canvas, rect);
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
      set({ canvas: restored, history: createHistory(contentSnapshot(restored)), canUndo: false, canRedo: false, selection: null, floatingSelection: null });
    },

    // --- Autosave recovery prompt (single active project, v1 scope) ---
    checkAutosaveRecovery: async () => {
      const snapshot = await readAutosave();
      return snapshot ?? null;
    },
    resumeAutosave: (doc) => {
      const restored = deserializeProject(doc);
      set({ canvas: restored, history: createHistory(contentSnapshot(restored)), canUndo: false, canRedo: false });
    },
    discardAutosave: async () => {
      await clearAutosave();
    },
  };
});
