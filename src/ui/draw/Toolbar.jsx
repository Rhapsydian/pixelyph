import { useStore } from '../../state/store.js';
import { TOOL_NAMES } from './tools/index.js';

const TOOL_LABELS = {
  pencil: 'Pencil',
  eraser: 'Eraser',
  bucketFill: 'Bucket Fill',
  eyedropper: 'Eyedropper',
  line: 'Line',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  marqueeSelect: 'Select',
};

const SYMMETRY_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'x', label: 'Mirror X' },
  { value: 'y', label: 'Mirror Y' },
  { value: 'both', label: 'Mirror Both' },
];

export function Toolbar() {
  const mode = useStore((s) => s.mode);
  const activeTool = useStore((s) => s.activeTool);
  const setActiveTool = useStore((s) => s.setActiveTool);
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
  const toggleTilePreview = useStore((s) => s.toggleTilePreview);
  const tier = useStore((s) => s.canvas.tier);
  const setTier = useStore((s) => s.setTier);
  const selectionScope = useStore((s) => s.selectionScope);
  const setSelectionScope = useStore((s) => s.setSelectionScope);

  const isGlyphMode = mode === 'glyph';
  // marqueeSelect works in both modes as of Phase 5 — the store's selection
  // actions are mode-aware (read/write whichever document is active), so
  // it's no longer Draw-mode-only.
  const toolNames = TOOL_NAMES;
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', padding: '0.5rem', background: '#1e1e1e', color: '#eee' }}>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {toolNames.map((name) => (
          <button
            key={name}
            onClick={() => setActiveTool(name)}
            style={{ fontWeight: activeTool === name ? 'bold' : 'normal', background: activeTool === name ? '#4da3ff' : '#333', color: '#fff', border: 'none', padding: '0.35rem 0.6rem', borderRadius: 4, cursor: 'pointer' }}
          >
            {TOOL_LABELS[name]}
          </button>
        ))}
      </div>

      {!isGlyphMode && (
        <div style={{ display: 'flex', gap: '0.25rem' }} title="Simple tier hides layer management; advanced tier exposes it">
          {['simple', 'advanced'].map((t) => (
            <button
              key={t}
              onClick={() => handleTierChange(t)}
              style={{ fontWeight: tier === t ? 'bold' : 'normal', background: tier === t ? '#4da3ff' : '#333', color: '#fff', border: 'none', padding: '0.35rem 0.6rem', borderRadius: 4, cursor: 'pointer', textTransform: 'capitalize' }}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {showsShapeToggle && (
        <label>
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

      <label>
        Zoom:{' '}
        <input type="range" min={4} max={48} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        {zoom}x
      </label>

      <label>
        <input type="checkbox" checked={showGrid} onChange={toggleGrid} /> Grid
      </label>

      <div style={{ display: 'flex', gap: '0.25rem' }}>
        <button onClick={undo} disabled={!canUndo}>
          Undo
        </button>
        <button onClick={redo} disabled={!canRedo}>
          Redo
        </button>
      </div>

      {!isGlyphMode && <button onClick={toggleTilePreview}>Tile Preview</button>}
    </div>
  );
}
