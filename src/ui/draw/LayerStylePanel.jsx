// Advanced tier only: edits the active layer's `style` — fill (solid /
// linear-gradient / radial-gradient / none), stroke (color/width/cap/join/
// dash), and effects (drop-shadow, "glow" as a drop-shadow preset, blur).
// See the plan's v1 LayerStyle scope note for why these are the only
// primitives offered here.

import { useEffect, useState } from 'react';
import { useStore } from '../../state/store.js';
import { ColorAlphaInput } from '../ColorAlphaInput.jsx';
import { FillSwatch } from '../FillSwatch.jsx';

const DEFAULT_LINEAR_GRADIENT = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] };
const DEFAULT_RADIAL_GRADIENT = { type: 'radial-gradient', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] };
const DEFAULT_PATTERN = { type: 'pattern', content: '<rect width="1" height="1" fill="#888888"/>', width: 4, height: 4 };
const DEFAULT_STROKE = { color: '#000000', width: 0.15, linejoin: 'round' };
const DEFAULT_DROP_SHADOW = { type: 'drop-shadow', dx: 0.3, dy: 0.3, blur: 0.2, color: '#000000', opacity: 0.6 };
const GLOW_PRESET = { type: 'drop-shadow', dx: 0, dy: 0, blur: 0.4, color: '#ffee88', opacity: 0.9 };
const DEFAULT_BLUR = { type: 'blur', stdDeviation: 0.3 };

function fillKind(fill) {
  if (fill == null) return 'none';
  if (typeof fill === 'string') return 'solid';
  return fill.type;
}

function FillEditor({ layer, updateLayerStyle }) {
  const addPaletteColor = useStore((s) => s.addPaletteColor);
  const addPaletteFill = useStore((s) => s.addPaletteFill);
  const fill = layer.style.fill;
  const kind = fillKind(fill);

  function setKind(newKind) {
    if (newKind === 'none') updateLayerStyle(layer.id, { fill: null });
    else if (newKind === 'solid') updateLayerStyle(layer.id, { fill: typeof fill === 'string' ? fill : '#808080' });
    else if (newKind === 'linear-gradient') updateLayerStyle(layer.id, { fill: DEFAULT_LINEAR_GRADIENT });
    else if (newKind === 'radial-gradient') updateLayerStyle(layer.id, { fill: DEFAULT_RADIAL_GRADIENT });
    else if (newKind === 'pattern') updateLayerStyle(layer.id, { fill: DEFAULT_PATTERN });
  }

  function saveToPalette() {
    if (kind === 'solid') addPaletteColor(fill);
    else if (kind === 'linear-gradient' || kind === 'radial-gradient' || kind === 'pattern') addPaletteFill(fill);
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

  // Controlled + resynced-on-change (not defaultValue) so switching to a
  // different pattern layer, or undo/redo, updates the textarea's displayed
  // content rather than leaving it showing a stale value.
  const [patternContent, setPatternContent] = useState(kind === 'pattern' ? fill.content : '');
  useEffect(() => {
    if (kind === 'pattern') setPatternContent(fill.content);
  }, [layer.id, kind, kind === 'pattern' ? fill.content : null]);

  return (
    <fieldset style={{ border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius-sm)' }}>
      <legend>Fill</legend>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="none">None</option>
          <option value="solid">Solid</option>
          <option value="linear-gradient">Linear gradient</option>
          <option value="radial-gradient">Radial gradient</option>
          <option value="pattern">Pattern</option>
        </select>
        {kind !== 'none' && (
          <button className="btn" onClick={saveToPalette} title="Save this fill to the shared palette">
            Save to palette
          </button>
        )}
      </span>

      {kind === 'solid' && (
        <span style={{ marginLeft: 8 }}>
          <ColorAlphaInput value={fill} onChange={(next) => updateLayerStyle(layer.id, { fill: next })} title="Fill color and opacity" />
        </span>
      )}

      {(kind === 'linear-gradient' || kind === 'radial-gradient') && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FillSwatch fill={fill} size={40} title="Live preview" />
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
          </span>
          {fill.stops.map((stop, i) => (
            <span key={i} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input type="number" min={0} max={1} step={0.05} value={stop.offset} onChange={(e) => updateStop(i, { offset: Number(e.target.value) })} style={{ width: 50 }} />
              <ColorAlphaInput value={stop.color} onChange={(next) => updateStop(i, { color: next })} title="Stop color and opacity" />
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

      {kind === 'pattern' && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FillSwatch fill={fill} size={40} title="Live preview" />
            <label>
              Tile width: <input type="number" min={0.1} step={0.5} value={fill.width} onChange={(e) => updateLayerStyle(layer.id, { fill: { ...fill, width: Number(e.target.value) } })} style={{ width: 50 }} />
            </label>
            <label>
              Tile height: <input type="number" min={0.1} step={0.5} value={fill.height} onChange={(e) => updateLayerStyle(layer.id, { fill: { ...fill, height: Number(e.target.value) } })} style={{ width: 50 }} />
            </label>
          </span>
          <label>
            Pattern content (raw SVG markup, tiled at the size above — authoring a pattern visually is out of scope):
            <textarea
              value={patternContent}
              onChange={(e) => setPatternContent(e.target.value)}
              onBlur={() => patternContent !== fill.content && updateLayerStyle(layer.id, { fill: { ...fill, content: patternContent } })}
              rows={3}
              style={{ width: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--text-xs)' }}
            />
          </label>
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
    <fieldset style={{ border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius-sm)' }}>
      <legend>
        <label>
          <input type="checkbox" checked={!!stroke} onChange={(e) => toggleStroke(e.target.checked)} /> Stroke
        </label>
      </legend>
      {stroke && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <ColorAlphaInput value={stroke.color} onChange={(next) => patchStroke({ color: next })} title="Stroke color and opacity" />
          <label>
            Width: <input type="number" min={0} step={0.05} value={stroke.width} onChange={(e) => patchStroke({ width: Number(e.target.value) })} style={{ width: 50 }} />
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
    <fieldset style={{ border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius-sm)' }}>
      <legend>Effects</legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {effects.map((effect, i) => (
          <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', background: 'var(--chrome-bg-raised)', padding: 4, borderRadius: 'var(--radius-sm)' }}>
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
                <ColorAlphaInput value={effect.color} onChange={(next) => patchEffect(i, { color: next })} title="Effect color and opacity" />
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
  const addPaletteStyle = useStore((s) => s.addPaletteStyle);

  if (canvas.tier !== 'advanced') return null;
  const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
  if (!layer) return <div className="panel" style={{ color: 'var(--chrome-text-muted)' }}>Select a layer to edit its style.</div>;

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Style — {layer.name}</strong>
        <button className="btn" onClick={() => addPaletteStyle(layer.style)} title="Save this layer's whole fill+stroke+effects as a reusable palette entry">
          Save style
        </button>
      </div>
      <FillEditor layer={layer} updateLayerStyle={updateLayerStyle} />
      <StrokeEditor layer={layer} updateLayerStyle={updateLayerStyle} />
      <EffectsEditor layer={layer} updateLayerStyle={updateLayerStyle} />
    </div>
  );
}
