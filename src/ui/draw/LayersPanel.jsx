// Advanced tier only: add/remove/reorder/select layers, and per-layer
// visible/locked/opacity. Rendered top-to-bottom in the panel
// (canvas.layers is back-to-front, so the panel reverses it for display —
// same convention most layer-panel tools use).

import { useState } from 'react';
import { useStore } from '../../state/store.js';
import { IconButton } from '../IconButton.jsx';
import { EyeIcon, EyeOffIcon, LockIcon, UnlockIcon, MoveUpIcon, MoveDownIcon, TrashIcon, DuplicateIcon, MergeDownIcon, PlusIcon } from '../icons.jsx';

function LayerRow({ layer, isActive, isBottom }) {
  const setActiveLayerId = useStore((s) => s.setActiveLayerId);
  const setLayerProps = useStore((s) => s.setLayerProps);
  const removeLayer = useStore((s) => s.removeLayer);
  const reorderLayer = useStore((s) => s.reorderLayer);
  const duplicateLayer = useStore((s) => s.duplicateLayer);
  const mergeLayerDown = useStore((s) => s.mergeLayerDown);

  const [name, setName] = useState(layer.name);
  const [opacity, setOpacity] = useState(layer.opacity);

  return (
    <div
      onClick={() => setActiveLayerId(layer.id)}
      className={isActive ? 'row active' : 'row'}
      style={{ flexWrap: 'wrap', padding: 'var(--space-2)', cursor: 'pointer' }}
    >
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
      <label onClick={(e) => e.stopPropagation()} title="Opacity">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          onMouseUp={() => setLayerProps(layer.id, { opacity })}
          onBlur={() => setLayerProps(layer.id, { opacity })}
          style={{ width: 60 }}
        />
      </label>
      <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', gap: 2 }}>
        <IconButton icon={<MoveUpIcon />} label="Move up" onClick={() => reorderLayer(layer.id, 1)} />
        <IconButton icon={<MoveDownIcon />} label="Move down" onClick={() => reorderLayer(layer.id, -1)} />
        <IconButton icon={<DuplicateIcon />} label="Duplicate layer" onClick={() => duplicateLayer(layer.id)} />
        <IconButton icon={<MergeDownIcon />} label="Merge down (keeps the layer below's style)" disabled={isBottom} onClick={() => mergeLayerDown(layer.id)} />
        <IconButton icon={<TrashIcon />} label="Delete layer" onClick={() => removeLayer(layer.id)} />
      </span>
    </div>
  );
}

export function LayersPanel() {
  // See LayerStylePanel for why this subscribes to the whole `canvas`
  // object rather than `canvas.layers`/`canvas.activeLayerId` directly.
  const canvas = useStore((s) => s.canvas);
  const addLayer = useStore((s) => s.addLayer);

  if (canvas.tier !== 'advanced') return null;

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Layers</strong>
        <IconButton icon={<PlusIcon />} label="Add layer" onClick={addLayer} />
      </div>
      {canvas.layers.length === 0 && <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>No layers yet — add one to start painting.</span>}
      {canvas.layers
        .slice()
        .reverse()
        .map((layer) => (
          <LayerRow key={layer.id} layer={layer} isActive={layer.id === canvas.activeLayerId} isBottom={layer.id === canvas.layers[0]?.id} />
        ))}
    </div>
  );
}
