// The live editing surface: real SVG DOM built with the same gridToPath
// pipeline used for export, not a Canvas2D approximation (see the plan's
// "Editor rendering surface" section) — what you see while editing is
// exactly what exports.
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
import { gridToPath } from 'pixelloom';
import { useStore } from '../../state/store.js';
import { tools } from './tools/index.js';
import { GridOverlay } from './GridOverlay.jsx';
import { BrushCursor } from './BrushCursor.jsx';
import { ReferenceImageLayer } from './ReferenceImageLayer.jsx';

export function SvgPixelEditor() {
  const canvas = useStore((s) => s.canvas);
  const activeTool = useStore((s) => s.activeTool);
  const zoom = useStore((s) => s.zoom);
  const showGrid = useStore((s) => s.showGrid);
  const selection = useStore((s) => s.selection);
  const floatingSelection = useStore((s) => s.floatingSelection);

  const svgRef = useRef(null);
  const dragRef = useRef({ mode: null, start: null, origin: null });
  const [, tick] = useState(0);
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
      const isUndo = (evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'z' && !evt.shiftKey;
      const isRedo = (evt.ctrlKey || evt.metaKey) && (evt.key.toLowerCase() === 'y' || (evt.key.toLowerCase() === 'z' && evt.shiftKey));
      if (isUndo) {
        evt.preventDefault();
        useStore.getState().undo();
      } else if (isRedo) {
        evt.preventDefault();
        useStore.getState().redo();
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
        return useStore.getState().canvas.width;
      },
      get canvasHeight() {
        return useStore.getState().canvas.height;
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
      liftSelection: (destructive) => useStore.getState().liftSelection(destructive),
      moveFloatingSelection: (x, y) => useStore.getState().moveFloatingSelection(x, y),
      dropFloatingSelection: () => {
        useStore.getState().dropFloatingSelection();
        tick((n) => n + 1);
      },
    }),
    [],
  );

  function clientToCell(evt) {
    const live = useStore.getState().canvas;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * live.width;
    const py = ((evt.clientY - rect.top) / rect.height) * live.height;
    return {
      x: Math.min(live.width - 1, Math.max(0, Math.floor(px))),
      y: Math.min(live.height - 1, Math.max(0, Math.floor(py))),
    };
  }

  function handlePointerDown(evt) {
    evt.currentTarget.setPointerCapture(evt.pointerId);
    ctx.shiftKey = evt.shiftKey;
    const { x, y } = clientToCell(evt);
    setCursorCell({ x, y });
    tools[activeTool].onPointerDown(ctx, x, y);
  }
  function handlePointerMove(evt) {
    const { x, y } = clientToCell(evt);
    setCursorCell({ x, y });
    ctx.shiftKey = evt.shiftKey;
    tools[activeTool].onPointerMove(ctx, x, y);
  }
  function handlePointerUp(evt) {
    const { x, y } = clientToCell(evt);
    tools[activeTool].onPointerUp(ctx, x, y);
  }

  const live = useStore.getState().canvas;
  const pixelWidth = live.width * zoom;
  const pixelHeight = live.height * zoom;

  const layerPaths = useMemo(
    () =>
      live.layers
        .filter((layer) => layer.visible)
        .map((layer) => {
          const d = gridToPath(layer.frames[0].pixels, layer.width, layer.height);
          const fill = typeof layer.style.fill === 'string' ? layer.style.fill : '#000000';
          return { id: layer.id, d, fill, opacity: layer.opacity, offset: layer.offset };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, canvas],
  );

  const normalizedSelection = selection && {
    x0: Math.min(selection.x0, selection.x1),
    y0: Math.min(selection.y0, selection.y1),
    x1: Math.max(selection.x0, selection.x1),
    y1: Math.max(selection.y0, selection.y1),
  };

  return (
    <div style={{ overflow: 'auto', border: '1px solid #444', background: '#2a2a2a', maxWidth: '100%', maxHeight: '70vh' }}>
      <svg
        ref={svgRef}
        width={pixelWidth}
        height={pixelHeight}
        viewBox={`0 0 ${live.width} ${live.height}`}
        style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <rect x={0} y={0} width={live.width} height={live.height} fill="#ffffff" />
        {live.referenceImage && <ReferenceImageLayer referenceImage={live.referenceImage} width={live.width} height={live.height} />}
        {layerPaths.map((layer) =>
          layer.d ? (
            <g key={layer.id} transform={`translate(${layer.offset.x},${layer.offset.y})`} opacity={layer.opacity}>
              <path d={layer.d} fill={layer.fill} fillRule="evenodd" />
            </g>
          ) : null,
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
        {showGrid && <GridOverlay width={live.width} height={live.height} />}
        {cursorCell && <BrushCursor x={cursorCell.x} y={cursorCell.y} />}
      </svg>
    </div>
  );
}
