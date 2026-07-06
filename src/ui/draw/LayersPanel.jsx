// Advanced tier only: add/remove/reorder/select layers, and per-layer
// visible/locked/opacity. Rendered top-to-bottom in the panel
// (canvas.layers is back-to-front, so the panel reverses it for display —
// same convention most layer-panel tools use).
//
// Move up/down, duplicate, merge down, and delete act on the active layer
// from one toolbar at the top (Phase 9) rather than per-row buttons — a
// row now only carries what's specific to *that* layer (thumbnail,
// visibility/lock, name, opacity); the five structural actions all target
// "the selected layer," so one shared control makes that explicit instead
// of repeating the same five buttons on every row.

import { useEffect, useState } from 'react';
import { useStore } from '../../state/store.js';
import { composeFrameBody } from '../../export/svg/composeLayersSvg.js';
import { IconButton } from '../IconButton.jsx';
import { PercentSlider } from '../PercentSlider.jsx';
import { EyeIcon, EyeOffIcon, LockIcon, UnlockIcon, MoveUpIcon, MoveDownIcon, TrashIcon, DuplicateIcon, MergeDownIcon, PlusIcon } from '../icons.jsx';

const THUMBNAIL_SIZE = 28;

/** A live preview of just this one layer's own content+style, reusing composeFrameBody (export/svg/composeLayersSvg.js) the same way FrameStrip.jsx's FrameThumbnail does for whole-frame previews — full-canvas viewBox, so an offset layer previews in its real canvas position. */
function LayerThumbnail({ canvas, layer }) {
  const { body, defs } = composeFrameBody({ ...canvas, layers: [layer] }, canvas.activeFrame);
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

function LayerRow({ canvas, layer, isActive }) {
  const setActiveLayerId = useStore((s) => s.setActiveLayerId);
  const setLayerProps = useStore((s) => s.setLayerProps);

  const [name, setName] = useState(layer.name);
  const [opacity, setOpacity] = useState(layer.opacity);
  useEffect(() => setName(layer.name), [layer.id, layer.name]);
  useEffect(() => setOpacity(layer.opacity), [layer.id, layer.opacity]);

  return (
    <div
      onClick={() => setActiveLayerId(layer.id)}
      className={isActive ? 'row active' : 'row'}
      style={{ flexWrap: 'wrap', padding: 'var(--space-2)', cursor: 'pointer', alignItems: 'center' }}
    >
      <LayerThumbnail canvas={canvas} layer={layer} />
      <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
        <IconButton
          icon={layer.visible ? <EyeIcon /> : <EyeOffIcon />}
          label={layer.visible ? 'Hide layer' : 'Show layer'}
          active={layer.visible}
          onClick={() => setLayerProps(layer.id, { visible: !layer.visible })}
        />
        <IconButton
          icon={layer.locked ? <LockIcon /> : <UnlockIcon />}
          label={layer.locked ? 'Unlock layer' : 'Lock layer'}
          active={layer.locked}
          onClick={() => setLayerProps(layer.id, { locked: !layer.locked })}
        />
      </span>
      <input
        value={name}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== layer.name && setLayerProps(layer.id, { name })}
        style={{ width: 90 }}
      />
      <span onClick={(e) => e.stopPropagation()}>
        <PercentSlider value={opacity} onChange={setOpacity} onCommit={(v) => setLayerProps(layer.id, { opacity: v })} title="Opacity" />
      </span>
    </div>
  );
}

function LayersToolbar({ canvas }) {
  const addLayer = useStore((s) => s.addLayer);
  const reorderLayer = useStore((s) => s.reorderLayer);
  const duplicateLayer = useStore((s) => s.duplicateLayer);
  const mergeLayerDown = useStore((s) => s.mergeLayerDown);
  const removeLayer = useStore((s) => s.removeLayer);

  const activeIndex = canvas.layers.findIndex((l) => l.id === canvas.activeLayerId);
  const hasActive = activeIndex >= 0;
  const isTop = activeIndex === canvas.layers.length - 1;
  const isBottom = activeIndex === 0;

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <strong>Layers</strong>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        <IconButton icon={<MoveUpIcon />} label="Move up" disabled={!hasActive || isTop} onClick={() => reorderLayer(canvas.activeLayerId, 1)} />
        <IconButton icon={<MoveDownIcon />} label="Move down" disabled={!hasActive || isBottom} onClick={() => reorderLayer(canvas.activeLayerId, -1)} />
        <IconButton icon={<DuplicateIcon />} label="Duplicate layer" disabled={!hasActive} onClick={() => duplicateLayer(canvas.activeLayerId)} />
        <IconButton icon={<MergeDownIcon />} label="Merge down (keeps the layer below's style)" disabled={!hasActive || isBottom} onClick={() => mergeLayerDown(canvas.activeLayerId)} />
        <IconButton icon={<TrashIcon />} label="Delete layer" disabled={!hasActive} onClick={() => removeLayer(canvas.activeLayerId)} />
        <IconButton icon={<PlusIcon />} label="Add layer" onClick={addLayer} />
      </span>
    </div>
  );
}

export function LayersPanel() {
  // See LayerStylePanel for why this subscribes to the whole `canvas`
  // object rather than `canvas.layers`/`canvas.activeLayerId` directly.
  const canvas = useStore((s) => s.canvas);

  if (canvas.tier !== 'advanced') return null;

  return (
    <div className="panel">
      <LayersToolbar canvas={canvas} />
      {canvas.layers.length === 0 && <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>No layers yet — add one to start painting.</span>}
      {canvas.layers
        .slice()
        .reverse()
        .map((layer) => (
          <LayerRow key={layer.id} canvas={canvas} layer={layer} isActive={layer.id === canvas.activeLayerId} />
        ))}
    </div>
  );
}
