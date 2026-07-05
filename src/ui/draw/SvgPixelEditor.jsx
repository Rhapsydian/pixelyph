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
import { ReferenceImageLayer } from './ReferenceImageLayer.jsx';
import { TransparencyBackground } from './TransparencyBackground.jsx';
import { composeLayersBody } from '../../export/svg/composeLayersSvg.js';

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
  const selection = useStore((s) => s.selection);
  const floatingSelection = useStore((s) => s.floatingSelection);
  const doc = mode === 'glyph' ? glyphCanvas : canvas;

  const svgRef = useRef(null);
  const dragRef = useRef({ mode: null, start: null, origin: null });
  const isPointerDownRef = useRef(false);
  const [tickCount, tick] = useState(0);
  const [preview, setPreview] = useState(null);
  const [cursorCell, setCursorCell] = useState(null);

  const prevToolRef = useRef(activeTool);
  useEffect(() => {
    if (prevToolRef.current === 'marqueeSelect' && activeTool !== 'marqueeSelect') {
      const state = useStore.getState();
      if (state.floatingSelection) state.dropFloatingSelection();
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
      const state = useStore.getState();

      if (isUndo) {
        evt.preventDefault();
        state.undo();
      } else if (isRedo) {
        evt.preventDefault();
        state.redo();
      } else if (evt.key === 'Escape') {
        // Cancel a pending move/copy (revert to the last committed snapshot),
        // or just deselect if nothing's been lifted yet.
        if (state.floatingSelection) state.cancelFloatingSelection();
        else if (state.selection) state.clearSelection();
      } else if (evt.key === 'Enter') {
        // Commit a floating selection in place — the marquee tool's primary
        // "make the move actually happen" action, previously only reachable
        // by switching tools or clicking outside the floating rect.
        if (state.floatingSelection) state.dropFloatingSelection();
      } else if (isCopy) {
        if (state.selection || state.floatingSelection) {
          evt.preventDefault();
          state.copySelection();
        }
      } else if (isCut) {
        if (state.selection || state.floatingSelection) {
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
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const ctx = useMemo(
    () => ({
      drag: dragRef.current,
      shiftKey: false,
      get activeColor() {
        return useStore.getState().activeColor;
      },
      get shapeFilled() {
        return useStore.getState().shapeFilled;
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
      selectTopLayerAt: (x, y) => {
        useStore.getState().selectTopLayerAt(x, y);
        tick((n) => n + 1);
      },
      paintCellLive: (x, y, color) => {
        useStore.getState().paintCellLive(x, y, color);
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
    }),
    [],
  );

  function clientToCell(evt) {
    const live = getActiveDocument();
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * live.width;
    const py = ((evt.clientY - rect.top) / rect.height) * live.height;
    const activeL = live.tier === 'advanced' ? live.layers?.find((l) => l.id === live.activeLayerId) : null;
    const ox = activeL?.offset.x ?? 0;
    const oy = activeL?.offset.y ?? 0;
    return {
      x: Math.min(live.width - 1, Math.max(0, Math.floor(px - ox) + ox)),
      y: Math.min(live.height - 1, Math.max(0, Math.floor(py - oy) + oy)),
    };
  }

  function handlePointerDown(evt) {
    evt.currentTarget.setPointerCapture(evt.pointerId);
    isPointerDownRef.current = true;
    ctx.shiftKey = evt.shiftKey;
    const { x, y } = clientToCell(evt);
    setCursorCell({ x, y });
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
    const { x, y } = clientToCell(evt);
    tools[activeTool].onPointerUp(ctx, x, y);
  }

  const pixelWidth = (doc?.width ?? 0) * zoom;
  const pixelHeight = (doc?.height ?? 0) * zoom;

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
    () => (doc ? composeLayersBody(doc) : { body: '', defs: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, canvas, glyphCanvas, tickCount],
  );
  const defsHtml = defs.length ? `<defs>${defs.join('')}</defs>` : '';

  const activeLayer = doc && doc.tier === 'advanced' ? doc.layers.find((l) => l.id === doc.activeLayerId) : null;

  const normalizedSelection = selection && {
    x0: Math.min(selection.x0, selection.x1),
    y0: Math.min(selection.y0, selection.y1),
    x1: Math.max(selection.x0, selection.x1),
    y1: Math.max(selection.y0, selection.y1),
  };

  if (!doc) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 200,
          border: '1px solid #444',
          background: '#2a2a2a',
          color: '#888',
        }}
      >
        No glyph selected — type a character or click a placeholder in the character map, then click Create.
      </div>
    );
  }

  return (
    <div style={{ overflow: 'auto', border: '1px solid #444', background: '#2a2a2a', maxWidth: '100%', maxHeight: '70vh' }}>
      <svg
        ref={svgRef}
        width={pixelWidth}
        height={pixelHeight}
        viewBox={`0 0 ${doc.width} ${doc.height}`}
        style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <TransparencyBackground width={doc.width} height={doc.height} />
        {defsHtml && <g dangerouslySetInnerHTML={{ __html: defsHtml }} />}
        {doc.referenceImage && <ReferenceImageLayer referenceImage={doc.referenceImage} width={doc.width} height={doc.height} />}
        <g dangerouslySetInnerHTML={{ __html: body }} />
        {activeLayer && (
          <rect
            x={activeLayer.offset.x}
            y={activeLayer.offset.y}
            width={activeLayer.width}
            height={activeLayer.height}
            fill="none"
            stroke="#ffcc4d"
            strokeWidth={0.08}
            strokeDasharray="0.24,0.16"
          />
        )}
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
        {normalizedSelection && !floatingSelection && (
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
        {showGrid && (
          <GridOverlay
            width={doc.width}
            height={doc.height}
            offsetX={activeLayer?.offset.x ?? 0}
            offsetY={activeLayer?.offset.y ?? 0}
          />
        )}
        {cursorCell && <BrushCursor x={cursorCell.x} y={cursorCell.y} />}
      </svg>
    </div>
  );
}
