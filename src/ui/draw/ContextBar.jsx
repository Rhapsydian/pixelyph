// Thin horizontal strip directly under the header, above the canvas/rail/
// panel row — mirrors Aseprite's own "context bar shows options for the
// current tool/mode" pattern (aseprite.org/docs/workspace-layout/ names
// "Tool Bar" and "Context Bar" as separate panels). Holds everything that
// depends on tier/tool/mode rather than tool identity itself (that's
// ToolRail's job): tier toggle, shape-filled toggle, selection scope,
// symmetry, zoom, grid, undo/redo.

import { useStore } from '../../state/store.js';
import { IconButton } from '../IconButton.jsx';
import { GridIcon, UndoIcon, RedoIcon } from '../icons.jsx';

const SYMMETRY_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'x', label: 'Mirror X' },
  { value: 'y', label: 'Mirror Y' },
  { value: 'both', label: 'Mirror Both' },
];

export function ContextBar() {
  const mode = useStore((s) => s.mode);
  const activeTool = useStore((s) => s.activeTool);
  const shapeFilled = useStore((s) => s.shapeFilled);
  const setShapeFilled = useStore((s) => s.setShapeFilled);
  const symmetryMode = useStore((s) => s.canvas.symmetryMode);
  const setSymmetryMode = useStore((s) => s.setSymmetryMode);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
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

      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        Zoom:{' '}
        <input type="range" min={4} max={48} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        {zoom}x
      </label>

      <IconButton icon={<GridIcon />} label="Toggle grid" active={showGrid} onClick={toggleGrid} />

      <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
        <IconButton icon={<UndoIcon />} label="Undo" disabled={!canUndo} onClick={undo} />
        <IconButton icon={<RedoIcon />} label="Redo" disabled={!canRedo} onClick={redo} />
      </div>
    </div>
  );
}
