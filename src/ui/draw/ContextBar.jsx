// Thin horizontal strip directly under the header, above the canvas/rail/
// panel row — mirrors Aseprite's own "context bar shows options for the
// current tool/mode" pattern (aseprite.org/docs/workspace-layout/ names
// "Tool Bar" and "Context Bar" as separate panels). Holds everything that
// depends on tier/tool/mode rather than tool identity itself (that's
// ToolRail's job): tier toggle, shape-filled toggle, selection scope,
// symmetry, grid, undo/redo, and canvas/glyph resize. Zoom lives in
// ViewportPreview (side panel) instead, alongside the minimap it drives.

import { useStore } from '../../state/store.js';
import { IconButton } from '../IconButton.jsx';
import { ColorAlphaInput } from '../ColorAlphaInput.jsx';
import { GridIcon, HorizontalSymmetryIcon, VerticalSymmetryIcon } from '../icons.jsx';
import { GLYPH_FILL } from '../../model/GlyphSet.js';

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
  const glyphDisplayColor = useStore((s) => s.glyphDisplayColor);
  const setGlyphDisplayColor = useStore((s) => s.setGlyphDisplayColor);
  const tileGridSize = useStore((s) => s.tileGridSize);
  const setTileGridSize = useStore((s) => s.setTileGridSize);
  const tier = useStore((s) => s.canvas.tier);
  const setTier = useStore((s) => s.setTier);
  const selectionScope = useStore((s) => s.selectionScope);
  const setSelectionScope = useStore((s) => s.setSelectionScope);
  const floatingGridSelection = useStore((s) => s.floatingGridSelection);
  const pasteColorMode = useStore((s) => s.pasteColorMode);
  const setPasteColorMode = useStore((s) => s.setPasteColorMode);
  const requestConfirm = useStore((s) => s.requestConfirm);

  const isGlyphMode = mode === 'glyph';
  const showsShapeToggle = activeTool === 'rectangle' || activeTool === 'ellipse';
  const showsBrushWidth = activeTool === 'pencil' || activeTool === 'eraser' || activeTool === 'line';
  const showsDither = activeTool === 'pencil';
  const showsPixelPerfect = activeTool === 'pencil' || activeTool === 'line';
  const showsFillOptions = activeTool === 'bucketFill';
  const showsToolOptions = showsBrushWidth || showsDither || showsPixelPerfect || showsFillOptions;
  const symmetryMode = isGlyphMode ? (glyphCanvas?.symmetryMode ?? 'none') : canvasSymmetryMode;
  const showsSelectScope = !isGlyphMode && tier === 'advanced';
  // Only while a pending, unmodified, external-paste-sourced
  // floatingGridSelection with 2+ distinct colors is around — pasteRaw is
  // only ever set in that case (see pasteImageBlob), and disappears once
  // the user moves/transforms the pending selection (touched), so the
  // choice can't be changed mid-manipulation.
  const showsPasteColorMode = !isGlyphMode && tier === 'advanced' && floatingGridSelection?.pasteRaw && !floatingGridSelection.touched;
  const hasToolSpecificControls = showsShapeToggle || showsSelectScope || showsPasteColorMode || showsToolOptions;

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
              {isGlyphMode && (
                <ColorAlphaInput
                  value={glyphDisplayColor || GLYPH_FILL}
                  onChange={setGlyphDisplayColor}
                  title="Glyph display color — changes how pixels render on this canvas only; not saved, exported, or part of undo history"
                />
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="A heavier guide line every N cells, e.g. for tileset/tile-boundary work — independent of the plain per-cell grid">
                <input
                  type="checkbox"
                  checked={tileGridSize > 0}
                  onChange={(e) => setTileGridSize(e.target.checked ? 8 : 0)}
                />
                Tile
              </label>
              {tileGridSize > 0 && (
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={tileGridSize}
                  onChange={(e) => setTileGridSize(e.target.value)}
                  style={{ width: 40 }}
                />
              )}
            </div>
          );
        })()}
      </div>

      {hasToolSpecificControls && (
        <>
          <div className="context-bar-divider" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {showsShapeToggle && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={shapeFilled} onChange={(e) => setShapeFilled(e.target.checked)} /> Filled
              </label>
            )}

            {showsSelectScope && (
              <label title="Whether Select/Copy/Cut/Paste and Transform > Flip/Rotate (when nothing is already selected) act on only the active shape or the whole active layer">
                Select from:{' '}
                <select value={selectionScope} onChange={(e) => setSelectionScope(e.target.value)}>
                  <option value="activeShape">Active shape</option>
                  <option value="activeLayer">Active layer</option>
                </select>
              </label>
            )}

            {showsPasteColorMode && (
              <label title="Multiple shapes preserves the pasted image's per-pixel colors as separate shapes. Single shape unions every pasted pixel into one shape painted with the active color, discarding per-pixel color.">
                Paste as:{' '}
                <select value={pasteColorMode} onChange={(e) => setPasteColorMode(e.target.value)}>
                  <option value="multiple">Multiple shapes (by color)</option>
                  <option value="single">Single shape</option>
                </select>
              </label>
            )}

            {showsToolOptions && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
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
          </div>
        </>
      )}
    </div>
  );
}
