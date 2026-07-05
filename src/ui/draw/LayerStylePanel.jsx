// Advanced tier only: edits the active layer's `style` — fill (solid /
// linear-gradient / radial-gradient / none), stroke (color/width/cap/join/
// dash), and effects (drop-shadow, "glow" as a drop-shadow preset, blur).
// See the plan's v1 LayerStyle scope note for why these are the only
// primitives offered here.

import { useStore } from '../../state/store.js';

const DEFAULT_LINEAR_GRADIENT = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] };
const DEFAULT_RADIAL_GRADIENT = { type: 'radial-gradient', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] };
const DEFAULT_STROKE = { color: '#000000', width: 0.15, linecap: 'round', linejoin: 'round' };
const DEFAULT_DROP_SHADOW = { type: 'drop-shadow', dx: 0.3, dy: 0.3, blur: 0.2, color: '#000000', opacity: 0.6 };
const GLOW_PRESET = { type: 'drop-shadow', dx: 0, dy: 0, blur: 0.4, color: '#ffee88', opacity: 0.9 };
const DEFAULT_BLUR = { type: 'blur', stdDeviation: 0.3 };

function fillKind(fill) {
  if (fill == null) return 'none';
  if (typeof fill === 'string') return 'solid';
  return fill.type;
}

function FillEditor({ layer, updateLayerStyle }) {
  const fill = layer.style.fill;
  const kind = fillKind(fill);

  function setKind(newKind) {
    if (newKind === 'none') updateLayerStyle(layer.id, { fill: null });
    else if (newKind === 'solid') updateLayerStyle(layer.id, { fill: typeof fill === 'string' ? fill : '#808080' });
    else if (newKind === 'linear-gradient') updateLayerStyle(layer.id, { fill: DEFAULT_LINEAR_GRADIENT });
    else if (newKind === 'radial-gradient') updateLayerStyle(layer.id, { fill: DEFAULT_RADIAL_GRADIENT });
  }

  function updateStop(index, patch) {
    const stops = fill.stops.map((s, i) => (i === index ? { ...s, ...patch } : s));
    updateLayerStyle(layer.id, { fill: { ...fill, stops } });
  }

  function addStop() {
    updateLayerStyle(layer.id, { fill: { ...fill, stops: [...fill.stops, { offset: 1, color: '#ffffff' }] } });
  }

  function removeStop(index) {
    if (fill.stops.length <= 2) return;
    updateLayerStyle(layer.id, { fill: { ...fill, stops: fill.stops.filter((_, i) => i !== index) } });
  }

  return (
    <fieldset style={{ border: '1px solid #333', borderRadius: 4 }}>
      <legend>Fill</legend>
      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="none">None</option>
        <option value="solid">Solid</option>
        <option value="linear-gradient">Linear gradient</option>
        <option value="radial-gradient">Radial gradient</option>
      </select>

      {kind === 'solid' && (
        <input type="color" value={fill} onChange={(e) => updateLayerStyle(layer.id, { fill: e.target.value })} style={{ marginLeft: 8 }} />
      )}

      {(kind === 'linear-gradient' || kind === 'radial-gradient') && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {kind === 'linear-gradient' && (
            <label>
              Angle:{' '}
              <input type="number" value={fill.angle} onChange={(e) => updateLayerStyle(layer.id, { fill: { ...fill, angle: Number(e.target.value) } })} style={{ width: 60 }} />°
            </label>
          )}
          {kind === 'radial-gradient' && (
            <span style={{ display: 'inline-flex', gap: 8 }}>
              <label>
                cx: <input type="number" step={0.05} value={fill.cx} onChange={(e) => updateLayerStyle(layer.id, { fill: { ...fill, cx: Number(e.target.value) } })} style={{ width: 50 }} />
              </label>
              <label>
                cy: <input type="number" step={0.05} value={fill.cy} onChange={(e) => updateLayerStyle(layer.id, { fill: { ...fill, cy: Number(e.target.value) } })} style={{ width: 50 }} />
              </label>
              <label>
                r: <input type="number" step={0.05} value={fill.r} onChange={(e) => updateLayerStyle(layer.id, { fill: { ...fill, r: Number(e.target.value) } })} style={{ width: 50 }} />
              </label>
            </span>
          )}
          {fill.stops.map((stop, i) => (
            <span key={i} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input type="number" min={0} max={1} step={0.05} value={stop.offset} onChange={(e) => updateStop(i, { offset: Number(e.target.value) })} style={{ width: 50 }} />
              <input type="color" value={stop.color} onChange={(e) => updateStop(i, { color: e.target.value })} />
              <button onClick={() => removeStop(i)} disabled={fill.stops.length <= 2}>
                ✕
              </button>
            </span>
          ))}
          <button onClick={addStop} style={{ alignSelf: 'flex-start' }}>
            + Stop
          </button>
        </div>
      )}
    </fieldset>
  );
}

function StrokeEditor({ layer, updateLayerStyle }) {
  const stroke = layer.style.stroke;

  function toggleStroke(enabled) {
    updateLayerStyle(layer.id, { stroke: enabled ? DEFAULT_STROKE : undefined });
  }
  function patchStroke(patch) {
    updateLayerStyle(layer.id, { stroke: { ...stroke, ...patch } });
  }

  return (
    <fieldset style={{ border: '1px solid #333', borderRadius: 4 }}>
      <legend>
        <label>
          <input type="checkbox" checked={!!stroke} onChange={(e) => toggleStroke(e.target.checked)} /> Stroke
        </label>
      </legend>
      {stroke && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input type="color" value={stroke.color} onChange={(e) => patchStroke({ color: e.target.value })} />
          <label>
            Width: <input type="number" min={0} step={0.05} value={stroke.width} onChange={(e) => patchStroke({ width: Number(e.target.value) })} style={{ width: 50 }} />
          </label>
          <label>
            Cap:{' '}
            <select value={stroke.linecap} onChange={(e) => patchStroke({ linecap: e.target.value })}>
              <option value="butt">Butt</option>
              <option value="round">Round</option>
              <option value="square">Square</option>
            </select>
          </label>
          <label>
            Join:{' '}
            <select value={stroke.linejoin} onChange={(e) => patchStroke({ linejoin: e.target.value })}>
              <option value="miter">Miter</option>
              <option value="round">Round</option>
              <option value="bevel">Bevel</option>
            </select>
          </label>
          <label>
            Dash:{' '}
            <input
              type="text"
              placeholder="e.g. 0.5,0.25"
              defaultValue={stroke.dashArray ? stroke.dashArray.join(',') : ''}
              onBlur={(e) => {
                const text = e.target.value.trim();
                const dashArray = text ? text.split(',').map(Number).filter((n) => !Number.isNaN(n)) : undefined;
                patchStroke({ dashArray });
              }}
              style={{ width: 90 }}
            />
          </label>
        </div>
      )}
    </fieldset>
  );
}

function EffectsEditor({ layer, updateLayerStyle }) {
  const effects = layer.style.effects ?? [];

  function setEffects(next) {
    updateLayerStyle(layer.id, { effects: next });
  }
  function addEffect(effect) {
    setEffects([...effects, effect]);
  }
  function patchEffect(index, patch) {
    setEffects(effects.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }
  function removeEffect(index) {
    setEffects(effects.filter((_, i) => i !== index));
  }

  return (
    <fieldset style={{ border: '1px solid #333', borderRadius: 4 }}>
      <legend>Effects</legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {effects.map((effect, i) => (
          <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', background: '#242424', padding: 4, borderRadius: 4 }}>
            <strong>{effect.type}</strong>
            {effect.type === 'drop-shadow' && (
              <>
                <label>
                  dx: <input type="number" step={0.05} value={effect.dx} onChange={(e) => patchEffect(i, { dx: Number(e.target.value) })} style={{ width: 50 }} />
                </label>
                <label>
                  dy: <input type="number" step={0.05} value={effect.dy} onChange={(e) => patchEffect(i, { dy: Number(e.target.value) })} style={{ width: 50 }} />
                </label>
                <label>
                  blur: <input type="number" min={0} step={0.05} value={effect.blur} onChange={(e) => patchEffect(i, { blur: Number(e.target.value) })} style={{ width: 50 }} />
                </label>
                <input type="color" value={effect.color} onChange={(e) => patchEffect(i, { color: e.target.value })} />
                <label>
                  opacity: <input type="number" min={0} max={1} step={0.05} value={effect.opacity ?? 1} onChange={(e) => patchEffect(i, { opacity: Number(e.target.value) })} style={{ width: 50 }} />
                </label>
              </>
            )}
            {effect.type === 'blur' && (
              <label>
                stdDeviation: <input type="number" min={0} step={0.05} value={effect.stdDeviation} onChange={(e) => patchEffect(i, { stdDeviation: Number(e.target.value) })} style={{ width: 50 }} />
              </label>
            )}
            <button onClick={() => removeEffect(i)}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
        <button onClick={() => addEffect(DEFAULT_DROP_SHADOW)}>+ Drop shadow</button>
        <button onClick={() => addEffect(GLOW_PRESET)}>+ Glow</button>
        <button onClick={() => addEffect(DEFAULT_BLUR)}>+ Blur</button>
      </div>
    </fieldset>
  );
}

export function LayerStylePanel() {
  // Subscribes to the whole `canvas` object, not a nested field like
  // `canvas.layers`/`canvas.activeLayerId` — those are frequently mutated
  // in place (a layer's .style reassigned, not the layers array itself),
  // so a narrower selector's reference wouldn't change and this panel would
  // silently miss the update. `canvas` itself gets a fresh top-level
  // reference on every commit()/touchCanvas() (see state/store.js), so
  // subscribing to it is what SvgPixelEditor already does for the same reason.
  const canvas = useStore((s) => s.canvas);
  const updateLayerStyle = useStore((s) => s.updateLayerStyle);

  if (canvas.tier !== 'advanced') return null;
  const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
  if (!layer) return <div style={{ padding: '0.5rem', color: '#888' }}>Select a layer to edit its style.</div>;

  return (
    <div style={{ padding: '0.5rem', background: '#1e1e1e', color: '#eee', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 320 }}>
      <strong>Style — {layer.name}</strong>
      <FillEditor layer={layer} updateLayerStyle={updateLayerStyle} />
      <StrokeEditor layer={layer} updateLayerStyle={updateLayerStyle} />
      <EffectsEditor layer={layer} updateLayerStyle={updateLayerStyle} />
    </div>
  );
}
