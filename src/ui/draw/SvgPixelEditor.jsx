// The live editing surface: real SVG DOM built with the exact same
// composeLayersBody markup used for export, not a Canvas2D approximation
// (see the plan's "Editor rendering surface" section) — what you see while
// editing is exactly what exports, gradients/stroke/filters included.
//
// Performance note / simplification: the plan's ideal is patching only the
// touched layer's `d` attribute via a ref during a drag, bypassing React
// entirely. This implementation instead mutates the live `canvas` object
// in place (paintCellLive, no store `set()` call) and forces *this*
// component alone to re-render via a local tick — simpler to get right
// for the general case (a stroke can create or empty out an auto-managed
// layer mid-drag, changing which layers even exist), while still never
// touching the global store until pointer-up. At pixel-art scale this is
// still far cheaper than a Canvas2D full-frame redraw.

import { useRef, useState, useEffect, useMemo } from 'react';
import { useStore } from '../../state/store.js';
import { tools } from './tools/index.js';
import { GridOverlay } from './GridOverlay.jsx';
import { BrushCursor } from './BrushCursor.jsx';
import { GradientAngleHandle } from './GradientAngleHandle.jsx';
import { GradientLinearEndpointsHandle } from './GradientLinearEndpointsHandle.jsx';
import { GradientRadialHandle } from './GradientRadialHandle.jsx';
import { ReferenceImageLayer } from './ReferenceImageLayer.jsx';
import { TransparencyBackground } from './TransparencyBackground.jsx';
import { composeLayersBody, composeFrameBody } from '../../export/svg/composeLayersSvg.js';
import { currentFrameIndex, topLayerAndGridAt } from '../../model/Canvas.js';
import { buildFloatingGridPreviewDoc } from '../../model/selection.js';

/**
 * The Canvas-shaped document this editor is currently painting: Draw mode's
 * real `canvas`, or — in glyph mode — the active glyph re-wrapped as a
 * single-color pseudo-Canvas (GlyphSet.glyphToCanvas, built by the store).
 * Null in glyph mode until a glyph is selected. This one indirection is
 * what lets GlyphGridEditor reuse this component verbatim rather than
 * needing its own copy of the painting/rendering logic (see the plan's
 * "GlyphGridEditor reuses SvgPixelEditor" note).
 */
function getActiveDocument() {
  const s = useStore.getState();
  return s.mode === 'glyph' ? s.glyphCanvas : s.canvas;
}

export function SvgPixelEditor() {
  const mode = useStore((s) => s.mode);
  const canvas = useStore((s) => s.canvas);
  const glyphCanvas = useStore((s) => s.glyphCanvas);
  const activeTool = useStore((s) => s.activeTool);
  const zoom = useStore((s) => s.zoom);
  const showGrid = useStore((s) => s.showGrid);
  const tileGridSize = useStore((s) => s.tileGridSize);
  const pan = useStore((s) => s.pan);
  const setViewportSize = useStore((s) => s.setViewportSize);
  const selection = useStore((s) => s.selection);
  const floatingSelection = useStore((s) => s.floatingSelection);
  const floatingGridSelection = useStore((s) => s.floatingGridSelection);
  const onionSkinEnabled = useStore((s) => s.onionSkinEnabled);
  const sidePanelTab = useStore((s) => s.sidePanelTab);
  const gradientHandleEnabledGridId = useStore((s) => s.gradientHandleEnabledGridId);
  const doc = mode === 'glyph' ? glyphCanvas : canvas;

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const dragRef = useRef({ mode: null, start: null, origin: null });
  const isPointerDownRef = useRef(false);
  // Set when a pointerDown arrives while the animation is playing — that
  // gesture's whole job is to pause playback, not to paint, so pointerMove/
  // pointerUp for it are suppressed too (isPointerDownRef stays false,
  // which already makes handlePointerMove skip the tool's onPointerMove;
  // this ref is the one extra bit handlePointerUp needs, since it otherwise
  // calls the tool unconditionally).
  const suppressGestureRef = useRef(false);
  // True while a right-button drag is in flight — see the contextmenu
  // effect below for why this needs to be tracked at all.
  const rightDragRef = useRef(false);
  const [tickCount, tick] = useState(0);
  const [preview, setPreview] = useState(null);
  const [cursorCell, setCursorCell] = useState(null);
  const [viewportSize, setLocalViewportSize] = useState({ width: 0, height: 0 });

  const prevToolRef = useRef(activeTool);
  useEffect(() => {
    if (prevToolRef.current === 'marqueeSelect' && activeTool !== 'marqueeSelect') {
      const state = useStore.getState();
      if (state.floatingSelection || state.floatingGridSelection) state.dropFloatingSelection();
      else if (state.selection) state.clearSelection();
    }
    prevToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    function onKeyDown(evt) {
      // Don't hijack these while the user is editing a text field elsewhere
      // in the UI (layer name, hex color, dash-array text input, ...) —
      // those need their own native Ctrl+C/X/V/Enter/Escape behavior.
      const target = /** @type {HTMLElement|null} */ (document.activeElement);
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const isUndo = (evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'z' && !evt.shiftKey;
      const isRedo = (evt.ctrlKey || evt.metaKey) && (evt.key.toLowerCase() === 'y' || (evt.key.toLowerCase() === 'z' && evt.shiftKey));
      const isCopy = (evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'c';
      const isCut = (evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'x';
      const isPaste = (evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'v';
      const isSelectAll = (evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'a';
      const isArrow = evt.key === 'ArrowUp' || evt.key === 'ArrowDown' || evt.key === 'ArrowLeft' || evt.key === 'ArrowRight';
      const state = useStore.getState();

      if (isUndo) {
        evt.preventDefault();
        state.undo();
      } else if (isRedo) {
        evt.preventDefault();
        state.redo();
      } else if (evt.key === 'Escape') {
        // Cancel a pending move/copy (revert to the last committed snapshot
        // for the flat path; a pure no-op for floatingGridSelection, which
        // never mutated the document — see cancelFloatingSelection), or
        // just deselect if nothing's been lifted yet.
        if (state.floatingSelection || state.floatingGridSelection) state.cancelFloatingSelection();
        else if (state.selection) state.clearSelection();
      } else if (evt.key === 'Enter') {
        // Commit a floating selection in place — the marquee tool's primary
        // "make the move actually happen" action, previously only reachable
        // by switching tools or clicking outside the floating rect.
        if (state.floatingSelection || state.floatingGridSelection) state.dropFloatingSelection();
      } else if (isCopy) {
        if (state.selection || state.floatingSelection || state.floatingGridSelection) {
          evt.preventDefault();
          state.copySelection();
        }
      } else if (isCut) {
        if (state.selection || state.floatingSelection || state.floatingGridSelection) {
          evt.preventDefault();
          state.cutSelection();
        }
      } else if (isPaste) {
        if (state.clipboard) {
          evt.preventDefault();
          state.pasteClipboard();
        }
      } else if (isSelectAll) {
        // selectAll is mode-aware (Phase 5) — selects across whichever
        // document is active, Canvas or the glyph pseudo-Canvas.
        evt.preventDefault();
        state.selectAll();
      } else if (isArrow) {
        // Nudge, in priority order: a floating selection always wins (any
        // mode/tier); otherwise Shape tier moves the active shape, Pixel
        // tier/Glyph mode shifts the active layer's whole current-frame
        // content. A plain (not-yet-lifted) rect selection intentionally
        // does nothing here — there's no established "move this" target
        // until it's lifted into a floating selection.
        const step = evt.shiftKey ? 10 : 1;
        const dx = evt.key === 'ArrowLeft' ? -step : evt.key === 'ArrowRight' ? step : 0;
        const dy = evt.key === 'ArrowUp' ? -step : evt.key === 'ArrowDown' ? step : 0;
        if (state.floatingGridSelection) {
          evt.preventDefault();
          state.moveGridSelectionBy(dx, dy);
        } else if (state.floatingSelection) {
          evt.preventDefault();
          state.moveFloatingSelection(state.floatingSelection.x + dx, state.floatingSelection.y + dy);
        } else if (!state.selection) {
          const nudgeDoc = state.mode === 'glyph' ? state.glyphCanvas : state.canvas;
          if (nudgeDoc?.tier === 'advanced') {
            const frame = nudgeDoc.layers.find((l) => l.id === nudgeDoc.activeLayerId)?.frames[currentFrameIndex(nudgeDoc)];
            const activeGrid = frame?.grids.find((g) => g.id === nudgeDoc.activeGridId);
            if (activeGrid) {
              evt.preventDefault();
              state.setGridProps(nudgeDoc.activeLayerId, nudgeDoc.activeGridId, { offsetX: activeGrid.offsetX + dx, offsetY: activeGrid.offsetY + dy });
            }
          } else if (nudgeDoc) {
            evt.preventDefault();
            state.nudgeLayerFrame(nudgeDoc.activeLayerId, currentFrameIndex(nudgeDoc), dx, dy);
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // OS-clipboard image paste-in (Checkpoint 5) — a real image copied from
  // another app (e.g. a screenshot) lands as a floating selection, same as
  // Ctrl+V's internal-clipboard path above. Only acts when the clipboard
  // actually carries an image; otherwise falls through untouched so the
  // keydown handler's own Ctrl+V (internal clipboard) still works. Standard
  // DOM paste-event API — no Electron IPC involved, so this is expected to
  // behave identically in the Electron renderer, though that hasn't been
  // separately confirmed (only the web/Vite build has).
  useEffect(() => {
    function onPaste(evt) {
      const target = /** @type {HTMLElement|null} */ (document.activeElement);
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const items = evt.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            evt.preventDefault();
            useStore.getState().pasteImageBlob(blob);
          }
          return;
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // Closes a gap left by setPointerCapture (handlePointerDown): pointer
  // capture redirects pointermove/pointerup back to the svg no matter where
  // the cursor physically is, but has no effect on `contextmenu`, which
  // always hit-tests whatever's actually under the cursor. Without this, a
  // right-button drag-erase that's released outside the svg's bounds lets
  // the native context menu open on whatever's there, instead of the svg's
  // own onContextMenu below (which only helps when the event targets it
  // directly). One listener for the component's whole lifetime, gated by a
  // ref rather than added/removed per-gesture: contextmenu fires
  // synchronously right after pointerup for the same button release, so a
  // listener torn down inside handlePointerUp could lose that race and be
  // gone before its own gesture's contextmenu event arrives.
  useEffect(() => {
    function blockContextMenu(evt) {
      if (rightDragRef.current) evt.preventDefault();
    }
    document.addEventListener('contextmenu', blockContextMenu);
    return () => document.removeEventListener('contextmenu', blockContextMenu);
  }, []);

  // Scroll wheel controls zoom directly (rather than scrolling the
  // container) — needs a native listener with { passive: false } since
  // React attaches onWheel as passive by default, which silently ignores
  // preventDefault() and would scroll the page alongside zooming.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(evt) {
      evt.preventDefault();
      const state = useStore.getState();
      const delta = evt.deltaY > 0 ? -1 : 1;
      state.setZoom(Math.max(4, Math.min(48, state.zoom + delta)));
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [doc]);

  // Measures the visible viewport (the container that clips the SVG, now
  // that native scrolling/scrollbars are disabled in favor of our own
  // pan-driven positioning below) so both this component's centering math
  // and ViewportPreview's minimap rectangle agree on the same size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setLocalViewportSize({ width, height });
      setViewportSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc]);

  const ctx = useMemo(
    () => ({
      drag: dragRef.current,
      shiftKey: false,
      // Set from the pointer button at gesture start (handlePointerDown) —
      // right-click paints null instead of the active color for pencil,
      // bucketFill, line, rectangle, and ellipse (see tools/toolColor.js).
      erasing: false,
      get activeColor() {
        return useStore.getState().activeColor;
      },
      get shapeFilled() {
        return useStore.getState().shapeFilled;
      },
      get brushWidth() {
        return useStore.getState().brushWidth;
      },
      get ditherEnabled() {
        return useStore.getState().ditherEnabled;
      },
      get fillGlobal() {
        return useStore.getState().fillGlobal;
      },
      get fillTolerance() {
        return useStore.getState().fillTolerance;
      },
      get pixelPerfect() {
        return useStore.getState().pixelPerfect;
      },
      get canvasWidth() {
        return getActiveDocument()?.width ?? 0;
      },
      get canvasHeight() {
        return getActiveDocument()?.height ?? 0;
      },
      get tier() {
        return getActiveDocument()?.tier ?? 'simple';
      },
      get selectionScope() {
        return useStore.getState().selectionScope;
      },
      get activeLayerId() {
        return getActiveDocument()?.activeLayerId ?? null;
      },
      get activeGridId() {
        return getActiveDocument()?.activeGridId ?? null;
      },
      get activeGrid() {
        const live = getActiveDocument();
        const layer = live?.layers?.find((l) => l.id === live.activeLayerId);
        return layer?.frames[currentFrameIndex(live)]?.grids.find((g) => g.id === live.activeGridId) ?? null;
      },
      get frameIndex() {
        return currentFrameIndex(getActiveDocument());
      },
      hitTestShape: (x, y) => topLayerAndGridAt(getActiveDocument(), x, y),
      selectTopLayerAt: (x, y) => {
        useStore.getState().selectTopLayerAt(x, y);
        tick((n) => n + 1);
      },
      setActiveGridId: (layerId, gridId) => {
        useStore.getState().setActiveGridId(layerId, gridId);
        tick((n) => n + 1);
      },
      clearActiveGrid: () => {
        useStore.getState().clearActiveGrid();
        tick((n) => n + 1);
      },
      paintCellLive: (x, y, color) => {
        useStore.getState().paintCellLive(x, y, color);
        tick((n) => n + 1);
      },
      setGridPropsLive: (layerId, gridId, patch) => {
        useStore.getState().setGridPropsLive(layerId, gridId, patch);
        tick((n) => n + 1);
      },
      nudgeLayerFrameLive: (layerId, frameIndex, dx, dy) => {
        useStore.getState().nudgeLayerFrameLive(layerId, frameIndex, dx, dy);
        tick((n) => n + 1);
      },
      commitStroke: () => useStore.getState().commitStroke(),
      colorAt: (x, y) => useStore.getState().colorAt(x, y),
      setActiveColor: (color) => useStore.getState().setActiveColor(color),
      setPreview: (cells) => setPreview(cells),
      getSelection: () => useStore.getState().selection,
      getFloatingSelection: () => useStore.getState().floatingSelection,
      startSelection: (x, y) => useStore.getState().startSelection(x, y),
      updateSelection: (x, y) => useStore.getState().updateSelection(x, y),
      liftSelection: (destructive) => {
        // A destructive lift clears the source in place (see Canvas.paintCell) —
        // needs a tick so the memoized composed body (keyed on canvas
        // reference, not its mutated contents) picks up the clear immediately
        // instead of showing stale duplicate content until the eventual drop.
        useStore.getState().liftSelection(destructive);
        tick((n) => n + 1);
      },
      moveFloatingSelection: (x, y) => useStore.getState().moveFloatingSelection(x, y),
      dropFloatingSelection: () => {
        useStore.getState().dropFloatingSelection();
        tick((n) => n + 1);
      },
      // Shape tier's floatingGridSelection analog — never mutates `canvas`
      // in place (see liftGridSelection's own doc comment), so none of
      // these three need the tick() workaround liftSelection/
      // dropFloatingSelection above do: `floatingGridSelection` is its own
      // subscribed store field, a plain set() already triggers the normal
      // React re-render.
      getFloatingGridSelection: () => useStore.getState().floatingGridSelection,
      liftGridSelection: (destructive) => useStore.getState().liftGridSelection(destructive),
      moveGridSelectionBy: (dx, dy) => useStore.getState().moveGridSelectionBy(dx, dy),
      dropFloatingGridSelection: () => useStore.getState().dropFloatingSelection(),
    }),
    [],
  );

  // Shared client-px -> canvas-cell-space float conversion — clientToCell
  // floors/clamps this to a cell, but the gradient-angle handle needs the
  // raw sub-cell position for its drag math.
  function clientToCanvasFloat(evt) {
    const live = getActiveDocument();
    const rect = svgRef.current.getBoundingClientRect();
    return {
      px: ((evt.clientX - rect.left) / rect.width) * live.width,
      py: ((evt.clientY - rect.top) / rect.height) * live.height,
    };
  }

  function clientToCell(evt) {
    const live = getActiveDocument();
    const { px, py } = clientToCanvasFloat(evt);
    const activeL = live.tier === 'advanced' ? live.layers?.find((l) => l.id === live.activeLayerId) : null;
    const activeGrid = activeL?.frames[currentFrameIndex(live)]?.grids.find((g) => g.id === live.activeGridId);
    const ox = activeGrid?.offsetX ?? 0;
    const oy = activeGrid?.offsetY ?? 0;
    return {
      x: Math.min(live.width - 1, Math.max(0, Math.floor(px - ox) + ox)),
      y: Math.min(live.height - 1, Math.max(0, Math.floor(py - oy) + oy)),
    };
  }

  function handlePointerDown(evt) {
    evt.currentTarget.setPointerCapture(evt.pointerId);
    const { x, y } = clientToCell(evt);
    setCursorCell({ x, y });
    // A click during playback is a "stop the animation" gesture, not a
    // paint gesture — pause it and swallow the whole thing (down/move/up)
    // rather than also painting into whatever frame happens to be active
    // at that instant (which keeps changing every tick).
    if (useStore.getState().isPlaying) {
      useStore.getState().pauseAnimation();
      suppressGestureRef.current = true;
      return;
    }
    suppressGestureRef.current = false;
    isPointerDownRef.current = true;
    ctx.shiftKey = evt.shiftKey;
    // Captured once per gesture, not re-checked on move/up: evt.button only
    // reports the button that changed state, so it reads 0 on move events
    // even while the right button is held for the whole drag.
    ctx.erasing = evt.button === 2;
    rightDragRef.current = ctx.erasing;
    tools[activeTool].onPointerDown(ctx, x, y);
  }
  function handlePointerMove(evt) {
    const { x, y } = clientToCell(evt);
    setCursorCell({ x, y }); // hover feedback (BrushCursor) tracks the pointer regardless of button state
    if (!isPointerDownRef.current) return; // only an active drag should paint/preview — a bare hover must not
    ctx.shiftKey = evt.shiftKey;
    tools[activeTool].onPointerMove(ctx, x, y);
  }
  function handlePointerUp(evt) {
    isPointerDownRef.current = false;
    releaseRightDrag();
    const { x, y } = clientToCell(evt);
    if (suppressGestureRef.current) {
      suppressGestureRef.current = false;
      return;
    }
    tools[activeTool].onPointerUp(ctx, x, y);
  }
  function handlePointerCancel() {
    // Safety net for lost pointer capture (e.g. an OS-level interrupt)
    // without a normal pointerup ever arriving.
    isPointerDownRef.current = false;
    releaseRightDrag();
  }
  function releaseRightDrag() {
    if (!rightDragRef.current) return;
    // Deferred: this gesture's own contextmenu (if any) fires synchronously
    // right after this handler returns, so clearing the ref immediately
    // would unblock it before it arrives. The macrotask delay lets that
    // event get blocked first, then frees the ref for the next, unrelated
    // right-click anywhere else in the app.
    setTimeout(() => {
      rightDragRef.current = false;
    }, 0);
  }
  function handlePointerLeave() {
    setCursorCell(null); // hide the hover highlight once the pointer is no longer over the canvas
  }

  const pixelWidth = (doc?.width ?? 0) * zoom;
  const pixelHeight = (doc?.height ?? 0) * zoom;

  // Panning replaces native container scrolling entirely (see
  // canvas-editor-area's overflow:hidden) — when the zoomed canvas is
  // smaller than the viewport it's centered; once it's larger, `pan`
  // (persisted in the store so ViewportPreview's minimap can read/drag it)
  // picks up where centering leaves off. Clamped here rather than written
  // back to the store on every render, so a stale/out-of-range stored pan
  // (e.g. after zooming out) never shows blank space past the canvas edge.
  const maxPanX = Math.max(0, pixelWidth - viewportSize.width);
  const maxPanY = Math.max(0, pixelHeight - viewportSize.height);
  const clampedPanX = Math.max(0, Math.min(maxPanX, pan.x));
  const clampedPanY = Math.max(0, Math.min(maxPanY, pan.y));
  const offsetX = maxPanX > 0 ? -clampedPanX : (viewportSize.width - pixelWidth) / 2;
  const offsetY = maxPanY > 0 ? -clampedPanY : (viewportSize.height - pixelHeight) / 2;

  // Same composeLayersBody used for export, injected verbatim — so the
  // editing surface can't drift from what actually gets exported (gradients,
  // stroke, filters included) without also failing here.
  //
  // `tickCount` has to be a dependency here even though composeLayersBody
  // never reads it: paintCellLive mutates `doc` in place (see the file
  // header) rather than swapping in a new reference, so during a
  // pencil/eraser drag that object stays reference-equal render over
  // render. Without `tickCount` in the deps, useMemo would see "nothing
  // changed" and keep returning the pre-stroke markup until pointer-up's
  // commitStroke() finally produces a new reference — i.e. every cell
  // painted mid-drag would be invisible until mouse-up. `tickCount` is the
  // one thing that reliably changes on every paintCellLive call, so
  // including it forces a recompute each time.
  const { body, defs } = useMemo(
    () => (doc ? composeLayersBody(buildFloatingGridPreviewDoc(doc, floatingGridSelection)) : { body: '', defs: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, canvas, glyphCanvas, tickCount, floatingGridSelection],
  );
  const defsHtml = defs.length ? `<defs>${defs.join('')}</defs>` : '';

  // Onion skinning (Phase 7, Draw mode only — glyphs never animate): a faded,
  // color-tinted ghost of the immediately adjacent frame(s), rendered behind
  // the current frame's own body so the previous/next pose is visible as a
  // drawing reference without being mistaken for the frame actually being
  // edited. Reddish for "before," bluish for "after" — the same convention
  // most frame-based animation tools use.
  const onionSkin = useMemo(() => {
    if (mode !== 'draw' || !onionSkinEnabled || !doc || doc.frameCount <= 1) return null;
    const prevIndex = doc.activeFrame - 1;
    const nextIndex = doc.activeFrame + 1;
    return {
      prev: prevIndex >= 0 ? composeFrameBody(doc, prevIndex).body : null,
      next: nextIndex < doc.frameCount ? composeFrameBody(doc, nextIndex).body : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, onionSkinEnabled, doc, canvas, tickCount]);

  const activeLayer = doc && doc.tier === 'advanced' ? doc.layers.find((l) => l.id === doc.activeLayerId) : null;
  const activeGrid = activeLayer?.frames[currentFrameIndex(doc)]?.grids.find((g) => g.id === doc.activeGridId);
  // Gated on all three: a gradient fill (linear or radial), the Style tab
  // actually visible (that's where the toggle enabling this lives), and the
  // per-shape toggle itself — see LayerStylePanel.jsx's FillEditor
  // "Gradient fine controls" checkbox.
  const showGradientHandle =
    (activeGrid?.style?.fill?.type === 'linear-gradient' || activeGrid?.style?.fill?.type === 'radial-gradient') &&
    sidePanelTab === 'style' &&
    gradientHandleEnabledGridId === activeGrid?.id;

  const normalizedSelection = selection && {
    x0: Math.min(selection.x0, selection.x1),
    y0: Math.min(selection.y0, selection.y1),
    x1: Math.max(selection.x0, selection.x1),
    y1: Math.max(selection.y0, selection.y1),
  };

  if (!doc) {
    return (
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 200,
          border: '1px solid var(--chrome-border-strong)',
          background: 'var(--chrome-bg-canvas-surround)',
          color: 'var(--chrome-text-muted)',
        }}
      >
        No glyph selected — type a character or click a placeholder in the character map, then click Create.
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', border: '1px solid var(--chrome-border-strong)', background: 'var(--chrome-bg-canvas-surround)' }}>
      <svg
        ref={svgRef}
        width={pixelWidth}
        height={pixelHeight}
        viewBox={`0 0 ${doc.width} ${doc.height}`}
        style={{ position: 'absolute', left: offsetX, top: offsetY, display: 'block', touchAction: 'none', cursor: 'crosshair', overflow: 'visible' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(evt) => evt.preventDefault()}
      >
        {/* Nested, still-clipped viewport for the artwork itself and its non-interactive overlays —
            off-canvas content stays hidden here, same as before. Gradient handles render as direct
            children of the outer (now overflow:visible) svg below, so they stay visible/grabbable
            even when dragged outside the canvas bounds. */}
        <svg width={doc.width} height={doc.height} viewBox={`0 0 ${doc.width} ${doc.height}`} overflow="hidden">
        <TransparencyBackground width={doc.width} height={doc.height} />
        {defsHtml && <g dangerouslySetInnerHTML={{ __html: defsHtml }} />}
        {doc.referenceImage && <ReferenceImageLayer referenceImage={doc.referenceImage} width={doc.width} height={doc.height} />}
        {onionSkin?.prev && (
          <g opacity={0.35} style={{ filter: 'sepia(1) hue-rotate(-60deg) saturate(4)' }} dangerouslySetInnerHTML={{ __html: onionSkin.prev }} />
        )}
        {onionSkin?.next && (
          <g opacity={0.35} style={{ filter: 'sepia(1) hue-rotate(140deg) saturate(4)' }} dangerouslySetInnerHTML={{ __html: onionSkin.next }} />
        )}
        <g dangerouslySetInnerHTML={{ __html: body }} />
        {preview && (
          <g opacity={0.6}>
            {preview.map((cell, i) => (
              <rect key={i} x={cell.x} y={cell.y} width={1} height={1} fill={cell.color} />
            ))}
          </g>
        )}
        {floatingSelection && (
          <g opacity={0.75}>
            {floatingSelection.cells.map((cell, i) => (
              <rect key={i} x={floatingSelection.x + cell.dx} y={floatingSelection.y + cell.dy} width={1} height={1} fill={cell.color} />
            ))}
            <rect
              x={floatingSelection.x}
              y={floatingSelection.y}
              width={floatingSelection.width}
              height={floatingSelection.height}
              fill="none"
              stroke="#4da3ff"
              strokeWidth={0.1}
              strokeDasharray="0.3,0.2"
            />
          </g>
        )}
        {floatingGridSelection && (
          // The clones' actual (styled/gradient-intact) content already
          // renders as part of `body` above, via buildFloatingGridPreviewDoc
          // — this is just the same dashed-outline affordance
          // floatingSelection gets, tracking the selection's current rect.
          <rect
            x={floatingGridSelection.rect.x0}
            y={floatingGridSelection.rect.y0}
            width={floatingGridSelection.rect.x1 - floatingGridSelection.rect.x0 + 1}
            height={floatingGridSelection.rect.y1 - floatingGridSelection.rect.y0 + 1}
            fill="none"
            stroke="#4da3ff"
            strokeWidth={0.1}
            strokeDasharray="0.3,0.2"
          />
        )}
        {normalizedSelection && !floatingSelection && !floatingGridSelection && (
          <rect
            x={normalizedSelection.x0}
            y={normalizedSelection.y0}
            width={normalizedSelection.x1 - normalizedSelection.x0 + 1}
            height={normalizedSelection.y1 - normalizedSelection.y0 + 1}
            fill="rgba(77,163,255,0.15)"
            stroke="#4da3ff"
            strokeWidth={0.1}
            strokeDasharray="0.3,0.2"
          />
        )}
        {(showGrid || tileGridSize > 0) && (
          <GridOverlay
            width={doc.width}
            height={doc.height}
            offsetX={activeGrid?.offsetX ?? 0}
            offsetY={activeGrid?.offsetY ?? 0}
            showGrid={showGrid}
            tileGridSize={tileGridSize}
          />
        )}
        {cursorCell && <BrushCursor x={cursorCell.x} y={cursorCell.y} />}
        </svg>
        {showGradientHandle && activeGrid.style.fill.type === 'linear-gradient' && activeGrid.style.fill.mode !== 'endpoints' && (
          <GradientAngleHandle
            grid={activeGrid}
            getCanvasPoint={clientToCanvasFloat}
            onDragAngle={(angle) => {
              useStore.getState().updateGridStyleLive(activeLayer.id, activeGrid.id, { fill: { ...activeGrid.style.fill, angle } });
              tick((n) => n + 1);
            }}
            onCommitAngle={(angle) => {
              useStore.getState().updateGridStyle(activeLayer.id, activeGrid.id, { fill: { ...activeGrid.style.fill, angle } });
            }}
          />
        )}
        {showGradientHandle && activeGrid.style.fill.type === 'linear-gradient' && activeGrid.style.fill.mode === 'endpoints' && (
          <GradientLinearEndpointsHandle
            grid={activeGrid}
            getCanvasPoint={clientToCanvasFloat}
            onDragStart={(patch) => {
              useStore.getState().updateGridStyleLive(activeLayer.id, activeGrid.id, { fill: { ...activeGrid.style.fill, ...patch } });
              tick((n) => n + 1);
            }}
            onCommitStart={(patch) => {
              useStore.getState().updateGridStyle(activeLayer.id, activeGrid.id, { fill: { ...activeGrid.style.fill, ...patch } });
            }}
            onDragEnd={(patch) => {
              useStore.getState().updateGridStyleLive(activeLayer.id, activeGrid.id, { fill: { ...activeGrid.style.fill, ...patch } });
              tick((n) => n + 1);
            }}
            onCommitEnd={(patch) => {
              useStore.getState().updateGridStyle(activeLayer.id, activeGrid.id, { fill: { ...activeGrid.style.fill, ...patch } });
            }}
          />
        )}
        {showGradientHandle && activeGrid.style.fill.type === 'radial-gradient' && (
          <GradientRadialHandle
            grid={activeGrid}
            getCanvasPoint={clientToCanvasFloat}
            onDragCenter={(patch) => {
              useStore.getState().updateGridStyleLive(activeLayer.id, activeGrid.id, { fill: { ...activeGrid.style.fill, ...patch } });
              tick((n) => n + 1);
            }}
            onCommitCenter={(patch) => {
              useStore.getState().updateGridStyle(activeLayer.id, activeGrid.id, { fill: { ...activeGrid.style.fill, ...patch } });
            }}
            onDragRadius={(patch) => {
              useStore.getState().updateGridStyleLive(activeLayer.id, activeGrid.id, { fill: { ...activeGrid.style.fill, ...patch } });
              tick((n) => n + 1);
            }}
            onCommitRadius={(patch) => {
              useStore.getState().updateGridStyle(activeLayer.id, activeGrid.id, { fill: { ...activeGrid.style.fill, ...patch } });
            }}
            onDragFocal={(patch) => {
              useStore.getState().updateGridStyleLive(activeLayer.id, activeGrid.id, { fill: { ...activeGrid.style.fill, ...patch } });
              tick((n) => n + 1);
            }}
            onCommitFocal={(patch) => {
              useStore.getState().updateGridStyle(activeLayer.id, activeGrid.id, { fill: { ...activeGrid.style.fill, ...patch } });
            }}
          />
        )}
      </svg>
    </div>
  );
}
