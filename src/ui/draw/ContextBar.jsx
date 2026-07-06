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
import { GridIcon, UndoIcon, RedoIcon } from '../icons.jsx';

const SYMMETRY_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'x', label: 'Mirror X' },
  { value: 'y', label: 'Mirror Y' },
  { value: 'both', label: 'Mirror Both' },
];

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
  const symmetryMode = useStore((s) => s.canvas.symmetryMode);
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

  const isGlyphMode = mode === 'glyph';
  const showsShapeToggle = activeTool === 'rectangle' || activeTool === 'ellipse';

  function handleTierChange(newTier) {
    if (newTier === tier) return;
    if (
      newTier === 'simple' &&
      !window.confirm(
        'Switching to simple tier collapses every layer to its topmost visible color per cell — gradients, stroke, effects, and free-floating layer positions are lost, and overlapping same-color layers merge. This cannot be undone by switching back. Continue?',
      )
    ) {
      return;
    }
    setTier(newTier);
  }

  return (
    <div className="app-context-bar">
      {!isGlyphMode && (
        <div style={{ display: 'flex', gap: 4 }} title="Simple tier hides layer management; advanced tier exposes it">
          {['simple', 'advanced'].map((t) => (
            <button
              key={t}
              className={tier === t ? 'btn active' : 'btn'}
              onClick={() => handleTierChange(t)}
              style={{ textTransform: 'capitalize', fontWeight: tier === t ? 500 : 400 }}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {!isGlyphMode && showsShapeToggle && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={shapeFilled} onChange={(e) => setShapeFilled(e.target.checked)} /> Filled
        </label>
      )}

      {!isGlyphMode && tier === 'advanced' && (
        <label title="Whether Select/Copy/Cut read only the active layer, or whichever visible layer is topmost at each cell">
          Select from:{' '}
          <select value={selectionScope} onChange={(e) => setSelectionScope(e.target.value)}>
            <option value="activeLayer">Active layer</option>
            <option value="allVisible">All visible layers</option>
          </select>
        </label>
      )}

      {!isGlyphMode && (
        <label>
          Symmetry:{' '}
          <select value={symmetryMode} onChange={(e) => setSymmetryMode(e.target.value)}>
            {SYMMETRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <IconButton icon={<GridIcon />} label="Toggle grid" active={showGrid} onClick={toggleGrid} />

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
