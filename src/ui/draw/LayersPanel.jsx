// Advanced tier only: add/remove/reorder/select layers, and per-layer
// visible/locked/opacity. Rendered top-to-bottom in the panel
// (canvas.layers is back-to-front, so the panel reverses it for display —
// same convention most layer-panel tools use).

import { useState } from 'react';
import { useStore } from '../../state/store.js';

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
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        padding: '0.4rem',
        borderRadius: 4,
        cursor: 'pointer',
        background: isActive ? '#2d4a6b' : '#242424',
        border: isActive ? '1px solid #4da3ff' : '1px solid #333',
      }}
    >
      <input type="checkbox" checked={layer.visible} title="Visible" onClick={(e) => e.stopPropagation()} onChange={(e) => setLayerProps(layer.id, { visible: e.target.checked })} />
      <input type="checkbox" checked={layer.locked} title="Locked" onClick={(e) => e.stopPropagation()} onChange={(e) => setLayerProps(layer.id, { locked: e.target.checked })} />
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
        <button onClick={() => reorderLayer(layer.id, 1)} title="Move up">
          ▲
        </button>
        <button onClick={() => reorderLayer(layer.id, -1)} title="Move down">
          ▼
        </button>
        <button onClick={() => removeLayer(layer.id)} title="Delete layer">
          ✕
        </button>
        <button onClick={() => duplicateLayer(layer.id)} title="Duplicate layer">
          ⧉
        </button>
        <button onClick={() => mergeLayerDown(layer.id)} disabled={isBottom} title="Merge down (keeps the layer below's style)">
          ⭳
        </button>
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
    <div style={{ padding: '0.5rem', background: '#1e1e1e', color: '#eee', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 320 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Layers</strong>
        <button onClick={addLayer}>+ Add Layer</button>
      </div>
      {canvas.layers.length === 0 && <span style={{ color: '#888', fontSize: '0.85em' }}>No layers yet — add one to start painting.</span>}
      {canvas.layers
        .slice()
        .reverse()
        .map((layer) => (
          <LayerRow key={layer.id} layer={layer} isActive={layer.id === canvas.activeLayerId} isBottom={layer.id === canvas.layers[0]?.id} />
        ))}
    </div>
  );
}
