// Advanced tier only: add/remove/reorder/select layers, and per-layer
// visible/locked/opacity. Rendered top-to-bottom in the panel
// (canvas.layers is back-to-front, so the panel reverses it for display —
// same convention most layer-panel tools use). Visibility is per-*frame*
// (Layer.js) — the eye icon shows/hides a layer only in whichever frame is
// currently active, so different frames of the same animation can have
// different layers hidden.
//
// Move up/down, duplicate, merge down, and delete act on a shared toolbar
// at the top (Phase 9) rather than per-row buttons — a row now only
// carries what's specific to *that* layer (thumbnail, visibility/lock,
// name, opacity); the four structural actions all target "the selected
// thing," so one shared control makes that explicit instead of repeating
// the same buttons on every row.
//
// Session 3 (Layer/Frame/Grid redesign, see docs/data-model.md section 4):
// each layer row gets an expand caret revealing that layer's Shapes (model
// name `Grid`) *in the active frame* as sub-rows — a Shape row carries the
// exact same control set as a Layer row. Rather than a second nested
// toolbar, the shared toolbar itself context-switches between layer
// actions and shape actions depending on which kind of row was last
// clicked (`selectionKind`, local state below) — deliberately tracked
// separately from `canvas.activeGridId`, since that field auto-resolves to
// a shape via resolveActiveGrid (Canvas.js) even on a plain layer click
// (per docs/data-model.md section 2), which would otherwise make
// layer-level actions unreachable on any non-empty layer. "Add" stays two
// distinct, always-visible buttons (Add Layer here, Add Shape inline per
// expanded layer) rather than folding into the context switch too — unlike
// the other four, "add" isn't an action *on* the current selection, so
// silently flipping its meaning would be an easy way to add the wrong kind
// of thing by habit.

import { useEffect, useState } from 'react';
import { useStore } from '../../state/store.js';
import { composeFrameBody } from '../../export/svg/composeLayersSvg.js';
import { IconButton } from '../IconButton.jsx';
import { EyeIcon, EyeOffIcon, LockIcon, UnlockIcon, MoveUpIcon, MoveDownIcon, TrashIcon, DuplicateIcon, MergeDownIcon, PlusIcon, ChevronDownIcon } from '../icons.jsx';

const THUMBNAIL_SIZE = 28;

/** Shared SVG wrapper both thumbnail flavors below render into — same fixed size/border/background either way, just fed a different `body`/`defs`. */
function ThumbnailFrame({ canvas, body, defs }) {
  const defsHtml = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return (
    <svg
      width={THUMBNAIL_SIZE}
      height={THUMBNAIL_SIZE}
      viewBox={`0 0 ${canvas.width} ${canvas.height}`}
      style={{ background: 'var(--chrome-bg-canvas-surround)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius-sm)', flexShrink: 0, display: 'block' }}
    >
      {defsHtml && <g dangerouslySetInnerHTML={{ __html: defsHtml }} />}
      <g dangerouslySetInnerHTML={{ __html: body }} />
    </svg>
  );
}

/** A live preview of just this one layer's own content+style, reusing composeFrameBody (export/svg/composeLayersSvg.js) the same way FrameStrip.jsx's FrameThumbnail does for whole-frame previews — full-canvas viewBox, so an offset layer previews in its real canvas position. Forces every frame's `visible` to true on the copy passed in: composeLayersBody filters out invisible-in-this-frame layers (correct for the actual canvas render), but a thumbnail should always show what's on the layer regardless of its visibility toggle. */
function LayerThumbnail({ canvas, layer }) {
  const alwaysVisible = { ...layer, frames: layer.frames.map((frame) => ({ ...frame, visible: true })) };
  const { body, defs } = composeFrameBody({ ...canvas, layers: [alwaysVisible] }, canvas.activeFrame);
  return <ThumbnailFrame canvas={canvas} body={body} defs={defs} />;
}

/** Same idea as LayerThumbnail, scoped to one Shape (Grid) instead of a whole layer — wraps it in a throwaway single-frame, single-shape synthetic layer so composeFrameBody can render just that shape, forced visible regardless of its own visibility toggle. */
function ShapeThumbnail({ canvas, grid }) {
  const syntheticLayer = { id: 'shape-thumb', name: 'shape-thumb', locked: false, opacity: 1, frames: [{ visible: true, grids: [{ ...grid, visible: true }] }] };
  const { body, defs } = composeFrameBody({ ...canvas, layers: [syntheticLayer] }, 0);
  return <ThumbnailFrame canvas={canvas} body={body} defs={defs} />;
}

/** The shared eye/lock/name/opacity chrome common to a Layer row and a Shape row (a Shape carries the exact same control set — see the file header). Owns the local editing state for name/opacity (committed on blur/Enter) so callers just pass current values and change callbacks. */
function EntityControls({ visible, onToggleVisible, hideLabel, showLabel, locked, onToggleLocked, lockLabel, unlockLabel, name, onRename, opacity, onOpacityChange }) {
  const [localName, setLocalName] = useState(name);
  const [opacityPercent, setOpacityPercent] = useState(Math.round(opacity * 100));
  useEffect(() => setLocalName(name), [name]);
  useEffect(() => setOpacityPercent(Math.round(opacity * 100)), [opacity]);

  function commitOpacity() {
    const clamped = Math.max(0, Math.min(100, opacityPercent));
    setOpacityPercent(clamped);
    onOpacityChange(clamped / 100);
  }

  return (
    <>
      <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
        <IconButton
          icon={visible ? <EyeIcon /> : <EyeOffIcon />}
          label={visible ? hideLabel : showLabel}
          active={visible}
          onClick={() => onToggleVisible(!visible)}
        />
        <IconButton
          icon={locked ? <LockIcon /> : <UnlockIcon />}
          label={locked ? unlockLabel : lockLabel}
          active={locked}
          onClick={() => onToggleLocked(!locked)}
        />
      </span>
      <input
        type="text"
        value={localName}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setLocalName(e.target.value)}
        onBlur={() => localName !== name && onRename(localName)}
        style={{ width: 90 }}
      />
      <label onClick={(e) => e.stopPropagation()} title="Opacity" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          min={0}
          max={100}
          value={opacityPercent}
          onChange={(e) => setOpacityPercent(Number(e.target.value))}
          onBlur={commitOpacity}
          onKeyDown={(e) => e.key === 'Enter' && commitOpacity()}
          style={{ width: 48 }}
        />
        <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>%</span>
      </label>
    </>
  );
}

function ExpandCaret({ expanded }) {
  return (
    <span style={{ display: 'inline-flex', transform: expanded ? undefined : 'rotate(-90deg)' }}>
      <ChevronDownIcon />
    </span>
  );
}

function LayerRow({ canvas, layer, isActive, isExpanded, onToggleExpand, onSelect }) {
  const setActiveLayerId = useStore((s) => s.setActiveLayerId);
  const setLayerProps = useStore((s) => s.setLayerProps);
  const setLayerFrameVisibility = useStore((s) => s.setLayerFrameVisibility);

  // Visibility is per-frame (Layer.js) — this row only ever shows/toggles
  // it for whichever frame is currently active.
  const visibleInActiveFrame = layer.frames[canvas.activeFrame]?.visible ?? true;

  return (
    <div
      onClick={() => {
        setActiveLayerId(layer.id);
        onSelect();
      }}
      className={isActive ? 'row active' : 'row'}
      style={{ flexWrap: 'wrap', padding: 'var(--space-2)', cursor: 'pointer', alignItems: 'center' }}
    >
      <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
        <IconButton icon={<ExpandCaret expanded={isExpanded} />} label={isExpanded ? 'Collapse shapes' : 'Expand shapes'} onClick={onToggleExpand} />
      </span>
      <LayerThumbnail canvas={canvas} layer={layer} />
      <EntityControls
        visible={visibleInActiveFrame}
        onToggleVisible={(visible) => setLayerFrameVisibility(layer.id, visible)}
        hideLabel="Hide layer in this frame"
        showLabel="Show layer in this frame"
        locked={layer.locked}
        onToggleLocked={(locked) => setLayerProps(layer.id, { locked })}
        lockLabel="Lock layer"
        unlockLabel="Unlock layer"
        name={layer.name}
        onRename={(name) => setLayerProps(layer.id, { name })}
        opacity={layer.opacity}
        onOpacityChange={(opacity) => setLayerProps(layer.id, { opacity })}
      />
    </div>
  );
}

function ShapeRow({ canvas, layer, grid, isActive, onSelect }) {
  const setActiveGridId = useStore((s) => s.setActiveGridId);
  const setGridProps = useStore((s) => s.setGridProps);

  return (
    <div
      onClick={() => {
        setActiveGridId(layer.id, grid.id);
        onSelect();
      }}
      className={isActive ? 'row active' : 'row'}
      style={{ flexWrap: 'wrap', padding: 'var(--space-2)', paddingLeft: 'var(--space-6)', cursor: 'pointer', alignItems: 'center' }}
    >
      <ShapeThumbnail canvas={canvas} grid={grid} />
      <EntityControls
        visible={grid.visible}
        onToggleVisible={(visible) => setGridProps(layer.id, grid.id, { visible })}
        hideLabel="Hide shape"
        showLabel="Show shape"
        locked={grid.locked}
        onToggleLocked={(locked) => setGridProps(layer.id, grid.id, { locked })}
        lockLabel="Lock shape"
        unlockLabel="Unlock shape"
        name={grid.name}
        onRename={(name) => setGridProps(layer.id, grid.id, { name })}
        opacity={grid.opacity}
        onOpacityChange={(opacity) => setGridProps(layer.id, grid.id, { opacity })}
      />
      <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>
        ({grid.offsetX},{grid.offsetY}) {grid.width}×{grid.height}
      </span>
    </div>
  );
}

/**
 * Shared structural toolbar: move/duplicate/merge-down/delete act on
 * whichever kind of row was last explicitly clicked (`selectionKind`,
 * 'layer' | 'shape', passed down from LayersPanel), falling back to layer
 * actions whenever there's no real active shape to act on (e.g. the active
 * shape was since deleted, or nothing's ever been clicked yet) even if
 * `selectionKind` still says 'shape' — see the file header for why this
 * doesn't just derive from `canvas.activeGridId` directly. "Add Layer" is
 * always visible regardless of mode; "Add Shape" lives inline per expanded
 * layer instead (below).
 */
function LayersToolbar({ canvas, selectionKind }) {
  const addLayer = useStore((s) => s.addLayer);
  const reorderLayer = useStore((s) => s.reorderLayer);
  const duplicateLayer = useStore((s) => s.duplicateLayer);
  const mergeLayerDown = useStore((s) => s.mergeLayerDown);
  const removeLayer = useStore((s) => s.removeLayer);
  const reorderGrid = useStore((s) => s.reorderGrid);
  const duplicateGrid = useStore((s) => s.duplicateGrid);
  const mergeGridDown = useStore((s) => s.mergeGridDown);
  const removeGrid = useStore((s) => s.removeGrid);

  const activeLayer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
  const activeGrid = activeLayer?.frames[canvas.activeFrame]?.grids.find((g) => g.id === canvas.activeGridId);
  const showShapeActions = selectionKind === 'shape' && !!activeGrid;

  let label;
  let actionButtons;
  if (showShapeActions) {
    const grids = activeLayer.frames[canvas.activeFrame].grids;
    const index = grids.findIndex((g) => g.id === activeGrid.id);
    const isTop = index === grids.length - 1;
    const isBottom = index === 0;
    label = `Shape: ${activeGrid.name}`;
    actionButtons = (
      <>
        <IconButton icon={<MoveUpIcon />} label="Move shape up" disabled={isTop} onClick={() => reorderGrid(activeLayer.id, activeGrid.id, 1)} />
        <IconButton icon={<MoveDownIcon />} label="Move shape down" disabled={isBottom} onClick={() => reorderGrid(activeLayer.id, activeGrid.id, -1)} />
        <IconButton icon={<DuplicateIcon />} label="Duplicate shape" onClick={() => duplicateGrid(activeLayer.id, activeGrid.id)} />
        <IconButton icon={<MergeDownIcon />} label="Merge down (keeps the shape below's style)" disabled={isBottom} onClick={() => mergeGridDown(activeLayer.id, activeGrid.id)} />
        <IconButton icon={<TrashIcon />} label="Delete shape" onClick={() => removeGrid(activeLayer.id, activeGrid.id)} />
      </>
    );
  } else {
    const activeIndex = canvas.layers.findIndex((l) => l.id === canvas.activeLayerId);
    const hasActive = activeIndex >= 0;
    const isTop = activeIndex === canvas.layers.length - 1;
    const isBottom = activeIndex === 0;
    label = 'Layers';
    actionButtons = (
      <>
        <IconButton icon={<MoveUpIcon />} label="Move up" disabled={!hasActive || isTop} onClick={() => reorderLayer(canvas.activeLayerId, 1)} />
        <IconButton icon={<MoveDownIcon />} label="Move down" disabled={!hasActive || isBottom} onClick={() => reorderLayer(canvas.activeLayerId, -1)} />
        <IconButton icon={<DuplicateIcon />} label="Duplicate layer" disabled={!hasActive} onClick={() => duplicateLayer(canvas.activeLayerId)} />
        <IconButton icon={<MergeDownIcon />} label="Merge down (preserves each shape's own style)" disabled={!hasActive || isBottom} onClick={() => mergeLayerDown(canvas.activeLayerId)} />
        <IconButton icon={<TrashIcon />} label="Delete layer" disabled={!hasActive} onClick={() => removeLayer(canvas.activeLayerId)} />
      </>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <strong>{label}</strong>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {actionButtons}
        <IconButton icon={<PlusIcon />} label="Add layer" onClick={addLayer} />
      </span>
    </div>
  );
}

/** Inline per-layer "+ Add Shape" — the layer-scoped half of the two-add-buttons split (see file header); everything else a shape needs (move/duplicate/merge/delete) goes through the shared LayersToolbar once the new shape is selected. */
function AddShapeRow({ onAdd }) {
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 'var(--space-6)' }}>
      <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>Shapes</span>
      <IconButton icon={<PlusIcon />} label="Add shape" onClick={onAdd} />
    </div>
  );
}

export function LayersPanel() {
  // See LayerStylePanel for why this subscribes to the whole `canvas`
  // object rather than `canvas.layers`/`canvas.activeLayerId` directly.
  const canvas = useStore((s) => s.canvas);
  const addGrid = useStore((s) => s.addGrid);
  // Ephemeral UI state (like LayerStylePanel's editingFill) — not persisted,
  // not undo-tracked.
  const [expandedLayerIds, setExpandedLayerIds] = useState(() => new Set());
  // Which kind of row was last explicitly clicked — drives which half of
  // LayersToolbar's action set is shown. See the file header for why this
  // is tracked separately from canvas.activeGridId.
  const [selectionKind, setSelectionKind] = useState('layer');

  // Whenever a shape becomes active via the sticky frame/layer-switch
  // resolution (resolveActiveGrid, Canvas.js), make sure its owning layer's
  // row is expanded so the newly-active shape is never hidden behind a
  // collapsed group.
  useEffect(() => {
    if (!canvas.activeGridId) return;
    const owner = canvas.layers.find((l) => l.frames[canvas.activeFrame]?.grids.some((g) => g.id === canvas.activeGridId));
    if (!owner) return;
    setExpandedLayerIds((prev) => (prev.has(owner.id) ? prev : new Set(prev).add(owner.id)));
  }, [canvas.activeGridId, canvas.activeFrame, canvas.layers]);

  if (canvas.tier !== 'advanced') return null;

  function toggleExpand(layerId) {
    setExpandedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }

  return (
    <div className="panel">
      <LayersToolbar canvas={canvas} selectionKind={selectionKind} />
      {canvas.layers.length === 0 && <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>No layers yet — add one to start painting.</span>}
      {canvas.layers
        .slice()
        .reverse()
        .map((layer) => {
          const isExpanded = expandedLayerIds.has(layer.id);
          const grids = layer.frames[canvas.activeFrame]?.grids ?? [];
          return (
            <div key={layer.id}>
              <LayerRow
                canvas={canvas}
                layer={layer}
                isActive={layer.id === canvas.activeLayerId}
                isExpanded={isExpanded}
                onToggleExpand={() => toggleExpand(layer.id)}
                onSelect={() => setSelectionKind('layer')}
              />
              {isExpanded && (
                <>
                  <AddShapeRow
                    onAdd={() => {
                      addGrid(layer.id);
                      setSelectionKind('shape');
                    }}
                  />
                  {grids.length === 0 && (
                    <div style={{ paddingLeft: 'var(--space-6)', color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>No shapes in this frame yet.</div>
                  )}
                  {grids
                    .slice()
                    .reverse()
                    .map((grid) => (
                      <ShapeRow
                        key={grid.id}
                        canvas={canvas}
                        layer={layer}
                        grid={grid}
                        isActive={grid.id === canvas.activeGridId}
                        onSelect={() => setSelectionKind('shape')}
                      />
                    ))}
                </>
              )}
            </div>
          );
        })}
    </div>
  );
}
