// Thin horizontal strip directly under the header, above the canvas/rail/
// panel row — mirrors Aseprite's own "context bar shows options for the
// current tool/mode" pattern (aseprite.org/docs/workspace-layout/ names
// "Tool Bar" and "Context Bar" as separate panels). Holds everything that
// depends on tier/tool/mode rather than tool identity itself (that's
// ToolRail's job): tier toggle, shape-filled toggle, selection scope,
// symmetry, grid, undo/redo, and canvas/glyph resize. Zoom lives in
// ViewportPreview (side panel) instead, alongside the minimap it drives.

import { useEffect, useState } from 'react';
import { useStore } from '../../state/store.js';
import { IconButton } from '../IconButton.jsx';
import { GridIcon, UndoIcon, RedoIcon, HorizontalSymmetryIcon, VerticalSymmetryIcon } from '../icons.jsx';

// Display-only: `canvas.tier` keeps its stored 'simple'/'advanced' values
// everywhere (no save-format bump, no migration) — these two maps are the
// only place the Pixel/Shape names appear. Pixel (paint colors, shapes
// auto-managed) and Shape (author shapes manually) name the real axis this
// tier now controls, now that both tiers get real multi-layer support (see
// docs/data-model.md) and the only thing still tier-gated is manual
// shape/style authoring.
const TIER_LABELS = { simple: 'Pixel', advanced: 'Shape' };
const TIER_TOOLTIPS = {
  simple: 'Pixel tier: paint colors, shapes are auto-managed one per color',
  advanced: 'Shape tier: manually author shapes, fills, stroke, and effects',
};

// canvas.symmetryMode/glyphCanvas.symmetryMode is still one of
// 'none'/'x'/'y'/'both' in the store — these two independent X/Y toggles
// are a UI-only decomposition of that single value (each button reflects
// and flips its own axis; 'none' and 'both' are just the "neither" and
// "both" combinations, not separate buttons).
function symmetryAxes(mode) {
  return { x: mode === 'x' || mode === 'both', y: mode === 'y' || mode === 'both' };
}
function symmetryModeFromAxes(x, y) {
  if (x && y) return 'both';
  if (x) return 'x';
  if (y) return 'y';
  return 'none';
}

const ANCHORS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];

function CanvasSizeControl() {
  const width = useStore((s) => s.canvas.width);
  const height = useStore((s) => s.canvas.height);
  const resizeCanvas = useStore((s) => s.resizeCanvas);
  const [nextWidth, setNextWidth] = useState(width);
  const [nextHeight, setNextHeight] = useState(height);
  const [anchor, setAnchor] = useState('top-left');

  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <input type="number" min={1} max={512} value={nextWidth} onChange={(e) => setNextWidth(Number(e.target.value))} style={{ width: 56 }} />
      x
      <input type="number" min={1} max={512} value={nextHeight} onChange={(e) => setNextHeight(Number(e.target.value))} style={{ width: 56 }} />
      <select value={anchor} onChange={(e) => setAnchor(e.target.value)}>
        {ANCHORS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <button className="btn" onClick={() => resizeCanvas(nextWidth, nextHeight, anchor)}>Resize</button>
    </span>
  );
}

function GlyphSizeControl() {
  const activeCodepoint = useStore((s) => s.activeCodepoint);
  const glyphSet = useStore((s) => s.glyphSet);
  const resizeActiveGlyph = useStore((s) => s.resizeActiveGlyph);
  const glyph = activeCodepoint != null ? glyphSet?.glyphs.get(activeCodepoint) : null;
  const [nextWidth, setNextWidth] = useState(glyph?.width ?? 1);

  useEffect(() => {
    setNextWidth(glyph?.width ?? 1);
  }, [activeCodepoint, glyph?.width]);

  if (!glyph) return null;

  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      Glyph width:
      <input type="number" min={1} max={256} value={nextWidth} onChange={(e) => setNextWidth(Number(e.target.value))} style={{ width: 56 }} />
      <button className="btn" onClick={() => resizeActiveGlyph(nextWidth)}>Resize</button>
    </span>
  );
}

export function ContextBar() {
  const mode = useStore((s) => s.mode);
  const activeTool = useStore((s) => s.activeTool);
  const shapeFilled = useStore((s) => s.shapeFilled);
  const setShapeFilled = useStore((s) => s.setShapeFilled);
  const brushWidth = useStore((s) => s.brushWidth);
  const setBrushWidth = useStore((s) => s.setBrushWidth);
  const ditherEnabled = useStore((s) => s.ditherEnabled);
  const setDitherEnabled = useStore((s) => s.setDitherEnabled);
  const pixelPerfect = useStore((s) => s.pixelPerfect);
  const setPixelPerfect = useStore((s) => s.setPixelPerfect);
  const fillGlobal = useStore((s) => s.fillGlobal);
  const setFillGlobal = useStore((s) => s.setFillGlobal);
  const fillTolerance = useStore((s) => s.fillTolerance);
  const setFillTolerance = useStore((s) => s.setFillTolerance);
  const canvasSymmetryMode = useStore((s) => s.canvas.symmetryMode);
  const glyphCanvas = useStore((s) => s.glyphCanvas);
  const setSymmetryMode = useStore((s) => s.setSymmetryMode);
  const showGrid = useStore((s) => s.showGrid);
  const toggleGrid = useStore((s) => s.toggleGrid);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const tier = useStore((s) => s.canvas.tier);
  const setTier = useStore((s) => s.setTier);
  const selectionScope = useStore((s) => s.selectionScope);
  const setSelectionScope = useStore((s) => s.setSelectionScope);
  const requestConfirm = useStore((s) => s.requestConfirm);

  const isGlyphMode = mode === 'glyph';
  const showsShapeToggle = activeTool === 'rectangle' || activeTool === 'ellipse';
  const showsBrushWidth = activeTool === 'pencil' || activeTool === 'eraser' || activeTool === 'line';
  const showsDither = activeTool === 'pencil';
  const showsPixelPerfect = activeTool === 'pencil' || activeTool === 'line';
  const showsFillOptions = activeTool === 'bucketFill';
  const showsToolOptions = showsBrushWidth || showsDither || showsPixelPerfect || showsFillOptions;
  const symmetryMode = isGlyphMode ? (glyphCanvas?.symmetryMode ?? 'none') : canvasSymmetryMode;

  async function handleTierChange(newTier) {
    if (newTier === tier) return;
    if (
      newTier === 'simple' &&
      !(await requestConfirm(
        "Switching to Pixel tier collapses each layer's own shapes to its topmost visible color per cell — gradients, stroke, effects, and multiple shapes per layer are lost, and overlapping same-color shapes within a layer merge. Layer count, order, names, lock, and opacity are preserved. This cannot be undone by switching back. Continue?",
      ))
    ) {
      return;
    }
    setTier(newTier);
  }

  return (
    <div className="app-context-bar">
      {!isGlyphMode && (
        <div style={{ display: 'flex', gap: 4 }} title="Pixel tier auto-manages shapes by color; Shape tier exposes manual shape/style authoring">
          {['simple', 'advanced'].map((t) => (
            <button
              key={t}
              className={tier === t ? 'btn active' : 'btn'}
              onClick={() => handleTierChange(t)}
              style={{ fontWeight: tier === t ? 500 : 400 }}
              aria-pressed={tier === t}
              title={TIER_TOOLTIPS[t]}
            >
              {TIER_LABELS[t]}
            </button>
          ))}
        </div>
      )}

      {showsShapeToggle && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={shapeFilled} onChange={(e) => setShapeFilled(e.target.checked)} /> Filled
        </label>
      )}

      {!isGlyphMode && tier === 'advanced' && (
        <label title="Whether Select/Copy/Cut read only the active shape, only the active layer, or whichever visible layer is topmost at each cell">
          Select from:{' '}
          <select value={selectionScope} onChange={(e) => setSelectionScope(e.target.value)}>
            <option value="activeShape">Active shape</option>
            <option value="activeLayer">Active layer</option>
            <option value="allVisible">All visible layers</option>
          </select>
        </label>
      )}

      {(!isGlyphMode || glyphCanvas) && (() => {
        const { x: xOn, y: yOn } = symmetryAxes(symmetryMode);
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            <IconButton
              icon={<HorizontalSymmetryIcon />}
              label="Horizontal symmetry"
              active={xOn}
              onClick={() => setSymmetryMode(symmetryModeFromAxes(!xOn, yOn))}
            />
            <IconButton
              icon={<VerticalSymmetryIcon />}
              label="Vertical symmetry"
              active={yOn}
              onClick={() => setSymmetryMode(symmetryModeFromAxes(xOn, !yOn))}
            />
            <IconButton icon={<GridIcon />} label="Toggle grid" active={showGrid} onClick={toggleGrid} />
          </div>
        );
      })()}

      {showsToolOptions && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            borderLeft: '1px solid var(--chrome-border)',
            paddingLeft: 12,
          }}
        >
          {showsBrushWidth && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Brush width in cells">
              Width:
              <input
                type="number"
                min={1}
                max={8}
                value={brushWidth}
                onChange={(e) => setBrushWidth(Math.max(1, Math.min(8, Number(e.target.value))))}
                style={{ width: 40 }}
              />
            </label>
          )}
          {showsDither && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Paint a 50%-density checkerboard texture instead of a solid stroke">
              <input type="checkbox" checked={ditherEnabled} onChange={(e) => setDitherEnabled(e.target.checked)} /> Dither
            </label>
          )}
          {showsPixelPerfect && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Remove redundant staircase-corner pixels from freehand/line strokes">
              <input type="checkbox" checked={pixelPerfect} onChange={(e) => setPixelPerfect(e.target.checked)} /> Pixel-perfect
            </label>
          )}
          {showsFillOptions && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Fill matching cells everywhere on the canvas, not just the contiguous region">
                <input type="checkbox" checked={fillGlobal} onChange={(e) => setFillGlobal(e.target.checked)} /> Global
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="How close a color must be to match (0 = exact match only)">
                Tolerance:
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={fillTolerance}
                  onChange={(e) => setFillTolerance(Math.max(0, Math.min(255, Number(e.target.value))))}
                  style={{ width: 48 }}
                />
              </label>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginLeft: 'auto' }}>
        {isGlyphMode ? <GlyphSizeControl /> : <CanvasSizeControl />}
        <div style={{ display: 'flex', gap: 4 }}>
          <IconButton icon={<UndoIcon />} label="Undo" disabled={!canUndo} onClick={undo} />
          <IconButton icon={<RedoIcon />} label="Redo" disabled={!canRedo} onClick={redo} />
        </div>
      </div>
    </div>
  );
}
