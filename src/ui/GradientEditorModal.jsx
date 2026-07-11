// The gradient-editing surface, shared by two callers with different commit
// semantics: LayerStylePanel.jsx's FillEditor (editing a layer's actual fill
// live — `onChange` applies immediately to the real layer) and
// PalettePanel.jsx's FillsGroup "add a gradient" swatch (editing a local
// draft — `onChange` only updates the draft). Either way, this modal's own
// Cancel/Done footer is the same: `onCancel` backs out (Escape/backdrop
// count as Cancel too — see the Modal onClose wiring below), `onConfirm`
// keeps whatever's there. Each caller decides what "back out" actually means
// for its own case (FillEditor reverts the live layer fill to what it was
// before the modal opened; FillsGroup just drops the never-yet-committed
// draft) — this component doesn't need to know which, it just calls
// whichever callback matches the button pressed.
//
// Linear vs radial is a switch *inside* this modal (Style tab's Fill kind
// select only offers one combined "Gradient" option) rather than two
// separate fill kinds a user has to already know to pick between.
//
// The stop bar (a horizontal strip showing the gradient's colors left-to-
// right by offset, regardless of the gradient's own angle — same
// convention every other gradient-editing tool uses) has small draggable
// tabs, one per stop, for repositioning by drag; the stop list below it
// (offset/color/remove per row) is the precise-entry alternative and caps
// its own height with a scrollbar once it grows long — deliberately, so a
// long stop list scrolls itself rather than growing the modal or scrolling
// the whole modal (see Modal.jsx's own `overflow: auto`, which this stays
// well within by capping here first). "+ Stop" lives with that list (core
// editing content), not in the footer — it adds to what's being edited, it
// isn't a way to close the dialog.

import { useRef, useState } from 'react';
import { Modal, ModalActions } from './Modal.jsx';
import { ColorAlphaInput } from './ColorAlphaInput.jsx';
import { FillSwatch } from './FillSwatch.jsx';
import { endpointsFromAngle, angleFromEndpoints } from '../export/svg/layerStyle.js';

const MODAL_WIDTH = 340;
const STOP_LIST_MAX_HEIGHT = 160;

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function StopBar({ stops, selectedIndex, onSelect, onMoveStop }) {
  const ref = useRef(null);

  function offsetFromEvent(e) {
    const rect = ref.current.getBoundingClientRect();
    return rect.width === 0 ? 0 : clamp01((e.clientX - rect.left) / rect.width);
  }

  // Always a left-to-right linear gradient built from the stop list,
  // regardless of whether the fill itself is set to linear or radial — a
  // stop-position bar reads the same way in either mode, same convention
  // every other gradient-editing tool uses (the actual angle/shape is
  // previewed separately, via the swatch next to the type select).
  const gradientCss = `linear-gradient(to right, ${stops
    .slice()
    .sort((a, b) => a.offset - b.offset)
    .map((s) => `${s.color} ${s.offset * 100}%`)
    .join(', ')})`;

  return (
    <div style={{ position: 'relative', width: MODAL_WIDTH - 16, marginBottom: 14 }}>
      <div
        ref={ref}
        style={{
          width: '100%',
          height: 28,
          border: '1px solid var(--chrome-border-strong)',
          background: gradientCss,
        }}
      />
      {stops.map((stop, i) => (
        <div
          key={i}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onSelect(i);
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return;
            onMoveStop(i, offsetFromEvent(e));
          }}
          title={`Stop ${i + 1}: drag to reposition`}
          style={{
            position: 'absolute',
            left: `${stop.offset * 100}%`,
            top: '100%',
            marginTop: 2,
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderBottom: `8px solid ${i === selectedIndex ? 'var(--chrome-accent)' : 'var(--chrome-text)'}`,
            transform: 'translateX(-50%)',
            cursor: 'ew-resize',
            touchAction: 'none',
          }}
        />
      ))}
    </div>
  );
}

export function GradientEditorModal({ gradient, onChange, onCancel, onConfirm }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  function setType(type) {
    if (type === gradient.type) return;
    if (type === 'linear-gradient') onChange({ type: 'linear-gradient', mode: 'angle', angle: 0, stops: gradient.stops });
    else onChange({ type: 'radial-gradient', cx: 0.5, cy: 0.5, r: 0.5, stops: gradient.stops });
  }

  // Both representations (angle, and x1/y1/x2/y2) stay on the gradient object once
  // Endpoints mode has been entered — only recomputed at the moment of an explicit
  // mode switch, not kept continuously in sync during a drag.
  function setMode(mode) {
    if (mode === gradient.mode) return;
    if (mode === 'endpoints') {
      const { x1, y1, x2, y2 } = endpointsFromAngle(gradient.angle ?? 0);
      onChange({ ...gradient, mode, x1, y1, x2, y2 });
    } else {
      const angle = angleFromEndpoints(gradient.x1, gradient.y1, gradient.x2, gradient.y2);
      onChange({ ...gradient, mode, angle });
    }
  }

  function resetGeometry() {
    if (gradient.type === 'linear-gradient') onChange({ ...gradient, mode: 'angle', angle: 0 });
    else onChange({ ...gradient, cx: 0.5, cy: 0.5, r: 0.5, fx: undefined, fy: undefined });
  }

  function updateStop(index, patch) {
    const stops = gradient.stops.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...gradient, stops });
  }

  function addStop() {
    onChange({ ...gradient, stops: [...gradient.stops, { offset: 1, color: '#ffffff' }] });
  }

  function removeStop(index) {
    if (gradient.stops.length <= 2) return;
    onChange({ ...gradient, stops: gradient.stops.filter((_, i) => i !== index) });
    setSelectedIndex((cur) => Math.min(cur, gradient.stops.length - 2));
  }

  return (
    <Modal title="Edit Gradient" onClose={onCancel}>
      <div style={{ width: MODAL_WIDTH, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FillSwatch fill={gradient} size={40} title="Live preview" />
          <select value={gradient.type} onChange={(e) => setType(e.target.value)}>
            <option value="linear-gradient">Linear</option>
            <option value="radial-gradient">Radial</option>
          </select>
          {gradient.type === 'linear-gradient' && (
            <select value={gradient.mode ?? 'angle'} onChange={(e) => setMode(e.target.value)}>
              <option value="angle">Angle</option>
              <option value="endpoints">Endpoints</option>
            </select>
          )}
          <button className="btn" onClick={resetGeometry} style={{ marginLeft: 'auto' }} title="Reset position/geometry to defaults (stops are untouched)">
            Reset
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {gradient.type === 'linear-gradient' && (gradient.mode ?? 'angle') === 'angle' && (
            <label>
              Angle: <input type="number" value={gradient.angle} onChange={(e) => onChange({ ...gradient, angle: Number(e.target.value) })} style={{ width: 60 }} />°
            </label>
          )}
          {gradient.type === 'linear-gradient' && gradient.mode === 'endpoints' && (
            <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
              <label>
                x1: <input type="number" step={0.05} value={gradient.x1} onChange={(e) => onChange({ ...gradient, x1: Number(e.target.value) })} style={{ width: 50 }} />
              </label>
              <label>
                y1: <input type="number" step={0.05} value={gradient.y1} onChange={(e) => onChange({ ...gradient, y1: Number(e.target.value) })} style={{ width: 50 }} />
              </label>
              <label>
                x2: <input type="number" step={0.05} value={gradient.x2} onChange={(e) => onChange({ ...gradient, x2: Number(e.target.value) })} style={{ width: 50 }} />
              </label>
              <label>
                y2: <input type="number" step={0.05} value={gradient.y2} onChange={(e) => onChange({ ...gradient, y2: Number(e.target.value) })} style={{ width: 50 }} />
              </label>
            </span>
          )}
          {gradient.type === 'radial-gradient' && (
            <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
              <label>
                cx: <input type="number" step={0.05} value={gradient.cx} onChange={(e) => onChange({ ...gradient, cx: Number(e.target.value) })} style={{ width: 50 }} />
              </label>
              <label>
                cy: <input type="number" step={0.05} value={gradient.cy} onChange={(e) => onChange({ ...gradient, cy: Number(e.target.value) })} style={{ width: 50 }} />
              </label>
              <label>
                r: <input type="number" step={0.05} value={gradient.r} onChange={(e) => onChange({ ...gradient, r: Number(e.target.value) })} style={{ width: 50 }} />
              </label>
              <label title="Off-center highlight point, defaults to the center">
                fx: <input type="number" step={0.05} value={gradient.fx ?? gradient.cx} onChange={(e) => onChange({ ...gradient, fx: Number(e.target.value) })} style={{ width: 50 }} />
              </label>
              <label title="Off-center highlight point, defaults to the center">
                fy: <input type="number" step={0.05} value={gradient.fy ?? gradient.cy} onChange={(e) => onChange({ ...gradient, fy: Number(e.target.value) })} style={{ width: 50 }} />
              </label>
            </span>
          )}
        </div>

        <StopBar stops={gradient.stops} selectedIndex={selectedIndex} onSelect={setSelectedIndex} onMoveStop={(i, offset) => updateStop(i, { offset })} />

        <div style={{ maxHeight: STOP_LIST_MAX_HEIGHT, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {gradient.stops.map((stop, i) => (
            <span
              key={i}
              onClick={() => setSelectedIndex(i)}
              style={{
                display: 'inline-flex',
                gap: 4,
                alignItems: 'center',
                padding: 2,
                border: i === selectedIndex ? '1px solid var(--chrome-accent)' : '1px solid transparent',
              }}
            >
              <input type="number" min={0} max={1} step={0.05} value={stop.offset} onChange={(e) => updateStop(i, { offset: clamp01(Number(e.target.value)) })} style={{ width: 50 }} />
              <ColorAlphaInput value={stop.color} onChange={(next) => updateStop(i, { color: next })} title="Stop color and opacity" />
              <button onClick={() => removeStop(i)} disabled={gradient.stops.length <= 2}>
                ✕
              </button>
            </span>
          ))}
        </div>

        <button className="btn" onClick={addStop} style={{ alignSelf: 'flex-start' }}>+ Stop</button>
      </div>
      <ModalActions onCancel={onCancel} onConfirm={onConfirm} confirmLabel="Done" />
    </Modal>
  );
}
