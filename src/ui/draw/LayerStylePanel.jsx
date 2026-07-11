// Advanced tier only: edits the active Shape's (Grid's) `style` — fill
// (solid / gradient / none), stroke (color/width/cap/join/dash), and
// effects (drop-shadow, "glow" as a drop-shadow preset, blur). See the
// plan's v1 LayerStyle scope note for why these are the only primitives
// offered here. (Pattern fills were tried and removed — see BACKLOG.md.)
//
// Session 3 (Layer/Frame/Grid redesign): style moved off Layer onto Grid
// (docs/data-model.md), so this panel now resolves canvas.activeGridId
// within the active layer's active frame instead of the layer itself.
// FillEditor/StrokeEditor/EffectsEditor below are unchanged internally —
// they only ever read `.style`/`.id` off whatever's passed as `layer` and
// call the passed `updateLayerStyle(id, patch)` generically, so passing a
// Grid in place of a Layer (plus a bound update closure) satisfies their
// existing prop contract with no changes to those three components.

import { useState } from 'react';
import { useStore } from '../../state/store.js';
import { ColorAlphaInput } from '../ColorAlphaInput.jsx';
import { FillSwatch } from '../FillSwatch.jsx';
import { GradientEditorModal } from '../GradientEditorModal.jsx';
import { IconButton } from '../IconButton.jsx';
import { SaveToPaletteIcon } from '../icons.jsx';

const DEFAULT_GRADIENT = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] };
const DEFAULT_STROKE = { color: '#000000', width: 0.15, linejoin: 'round' };
const DEFAULT_DROP_SHADOW = { type: 'drop-shadow', dx: 0.3, dy: 0.3, blur: 0.2, color: '#000000', opacity: 0.6 };
const GLOW_PRESET = { type: 'drop-shadow', dx: 0, dy: 0, blur: 0.4, color: '#ffee88', opacity: 0.9 };
const DEFAULT_BLUR = { type: 'blur', stdDeviation: 0.3 };

/** @returns {'none'|'solid'|'gradient'} the *select's* kind — linear/radial fold into one "gradient" option; the modal is where you actually pick between them. */
function fillSelectKind(fill) {
  if (fill == null) return 'none';
  if (typeof fill === 'string') return 'solid';
  return 'gradient';
}

function FillEditor({ layer, updateLayerStyle }) {
  const addPaletteColor = useStore((s) => s.addPaletteColor);
  const addPaletteFill = useStore((s) => s.addPaletteFill);
  const requestName = useStore((s) => s.requestName);
  const gradientHandleEnabledGridId = useStore((s) => s.gradientHandleEnabledGridId);
  const setGradientHandleEnabled = useStore((s) => s.setGradientHandleEnabled);
  const fill = layer.style.fill;
  const kind = fillSelectKind(fill);
  const [editingFill, setEditingFill] = useState(false);
  // Captured when the gradient editor opens, so Cancel can restore it — edits
  // inside that modal apply live to the real layer fill via updateLayerStyle.
  const [fillBeforeEdit, setFillBeforeEdit] = useState(null);

  function openFillEditor() {
    setFillBeforeEdit(fill);
    setEditingFill(true);
  }

  function cancelFillEdit() {
    updateLayerStyle(layer.id, { fill: fillBeforeEdit });
    setEditingFill(false);
  }

  function setKind(newKind) {
    if (newKind === 'none') updateLayerStyle(layer.id, { fill: null });
    else if (newKind === 'solid') updateLayerStyle(layer.id, { fill: typeof fill === 'string' ? fill : '#808080' });
    else if (newKind === 'gradient') updateLayerStyle(layer.id, { fill: DEFAULT_GRADIENT });
  }

  async function saveToPalette() {
    if (kind === 'solid') addPaletteColor(fill);
    else if (kind === 'gradient') {
      const name = await requestName('Name this gradient');
      if (name == null) return;
      addPaletteFill({ ...fill, name });
    }
  }

  return (
    <fieldset style={{ border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius-sm)' }}>
      <legend>Fill</legend>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="none">None</option>
          <option value="solid">Solid</option>
          <option value="gradient">Gradient</option>
        </select>

        {kind === 'solid' && <ColorAlphaInput value={fill} onChange={(next) => updateLayerStyle(layer.id, { fill: next })} title="Fill color and opacity" />}

        {kind === 'gradient' && (
          <button
            type="button"
            onClick={openFillEditor}
            style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'none', display: 'flex', alignItems: 'center' }}
            title="Edit gradient"
          >
            <FillSwatch fill={fill} size={24} title="gradient" />
          </button>
        )}

        {kind !== 'none' && <IconButton icon={<SaveToPaletteIcon size={20} />} label="Save to palette" onClick={saveToPalette} />}
      </div>

      {(fill?.type === 'linear-gradient' || fill?.type === 'radial-gradient') && (
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}
          title="Show draggable on-canvas controls for this gradient's position/angle, instead of only through the gradient editor"
        >
          <input
            type="checkbox"
            checked={gradientHandleEnabledGridId === layer.id}
            onChange={(e) => setGradientHandleEnabled(layer.id, e.target.checked)}
          />
          Gradient fine controls
        </label>
      )}

      {editingFill && kind === 'gradient' && (
        <GradientEditorModal
          gradient={fill}
          onChange={(next) => updateLayerStyle(layer.id, { fill: next })}
          onCancel={cancelFillEdit}
          onConfirm={() => setEditingFill(false)}
        />
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
  // in place (a shape's .style reassigned, not the layers array itself),
  // so a narrower selector's reference wouldn't change and this panel would
  // silently miss the update. `canvas` itself gets a fresh top-level
  // reference on every commit()/touchCanvas() (see state/store.js), so
  // subscribing to it is what SvgPixelEditor already does for the same reason.
  const canvas = useStore((s) => s.canvas);
  const updateGridStyle = useStore((s) => s.updateGridStyle);
  const addPaletteStyle = useStore((s) => s.addPaletteStyle);
  const requestName = useStore((s) => s.requestName);

  if (canvas.tier !== 'advanced') return null;
  const layer = canvas.layers.find((l) => l.id === canvas.activeLayerId);
  const grid = layer?.frames[canvas.activeFrame]?.grids.find((g) => g.id === canvas.activeGridId);
  if (!grid) {
    return (
      <div className="panel" style={{ color: 'var(--chrome-text-muted)' }}>
        No shape selected — click a layer's shape above, or paint a cell to create one.
      </div>
    );
  }

  const boundUpdate = (id, patch) => updateGridStyle(layer.id, id, patch);

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Style — {grid.name}</strong>
        <IconButton
          icon={<SaveToPaletteIcon size={20} />}
          label="Save style"
          onClick={async () => {
            const name = await requestName('Name this style');
            if (name == null) return;
            addPaletteStyle(grid.style, name);
          }}
        />
      </div>
      <FillEditor layer={grid} updateLayerStyle={boundUpdate} />
      <StrokeEditor layer={grid} updateLayerStyle={boundUpdate} />
      <EffectsEditor layer={grid} updateLayerStyle={boundUpdate} />
    </div>
  );
}
