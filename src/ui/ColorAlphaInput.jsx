// Color+alpha input: a single swatch button that opens a popover (mirrors
// MenuBar.jsx's outside-click/Escape-to-close pattern and its zIndex: 10
// convention) — the popover is the *only* place editing happens: a live
// preview swatch + hex text field (accepts 3/4/6/8-digit shorthand), R/G/B/A
// sliders+number boxes (all four rows the same shape/size — see theme.css's
// `input[type="range"]` `min-width: 0` fix for why the sliders used to
// overflow), a "Color Picker" button that opens a centered, app-styled
// modal (Modal.jsx) wrapping a more traditional picker (RGB only, alpha
// stays whatever it already was), and a confirmation button that closes the
// popover. The popover is positioned `position: fixed` at coordinates
// measured from its trigger (post-render, before paint, via
// useLayoutEffect) rather than CSS-anchored `position: absolute` — fixed
// positioning is unaffected by a scrolling ancestor (in particular
// Modal.jsx's own scrollable panel, when this input is used inside a
// modal, e.g. the gradient editor's stop colors), which `absolute` isn't:
// an absolutely-positioned popover gets clipped by — and contributes to
// the scrollable overflow of — whatever ancestor it's clipped by. The
// measurement also flips the popover above/left whenever the default
// below/right placement would run off the viewport.
//
// The color-picker modal's Eyedropper button uses the real `EyeDropper` API
// (not the opaque, unhookable eyedropper baked into a native
// `<input type="color">` popup) specifically so its async lifecycle can be
// hooked into: the modal hides itself right before `.open()` (so its own
// backdrop doesn't block whatever the user is trying to sample) and shows
// again once the pick resolves or is cancelled.
//
// Composes to/parses from one #RRGGBB or #RRGGBBAA string, same wire format
// everywhere: Fill/Stroke/Effect colors and gradient stops in
// LayerStylePanel.jsx, and — via `renderSwatch`/`onDone`/`doneLabel` — the
// Palette panel's "add a new color" flow, so every color-picking surface in
// the app goes through this one popover.
//
// `onChange` fires live as the popover's fields change (same as every other
// live-committing control in LayerStylePanel), which is what lets an
// existing bound value (a layer's fill, a stroke, a gradient stop) preview
// as you adjust it. `onDone`/`doneLabel` are for callers that need the
// confirm action to *do* something beyond closing (the palette's "add
// color" swatch has no bound value to preview against — it holds its own
// draft and only commits on confirm).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal } from './Modal.jsx';

function clamp255(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function toHex2(n) {
  return clamp255(n).toString(16).padStart(2, '0');
}

function expandShorthand(hex) {
  return hex.length === 3 || hex.length === 4 ? hex.split('').map((c) => c + c).join('') : hex;
}

/** @returns {{r:number,g:number,b:number,alpha:number}|null} null if `text` isn't a valid #rgb/#rgba/#rrggbb/#rrggbbaa hex string */
function parseColor(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(raw);
  if (!match) return null;
  const hex = expandShorthand(match[1]).toLowerCase();
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    alpha: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
  };
}

function composeColor(r, g, b, alpha) {
  const hex = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
  return alpha >= 1 ? hex : `${hex}${toHex2(alpha * 255)}`;
}

/** @returns {{h:number,s:number,v:number}} h in [0,360), s/v in [0,1] */
function rgbToHsv(r, g, b) {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rf) h = ((gf - bf) / d) % 6;
    else if (max === gf) h = (bf - rf) / d + 2;
    else h = (rf - gf) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** @returns {{r:number,g:number,b:number}} */
function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return { r: clamp255((r1 + m) * 255), g: clamp255((g1 + m) * 255), b: clamp255((b1 + m) * 255) };
}

/** Shared pointer-drag handling for the saturation/value box and the hue slider below — captures the pointer on down so dragging past the element's edge keeps tracking, and only updates while the primary button is actually held. */
function usePointerDrag(onDrag) {
  const ref = useRef(null);
  function fromEvent(e) {
    const rect = ref.current.getBoundingClientRect();
    const x = rect.width === 0 ? 0 : Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = rect.height === 0 ? 0 : Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onDrag(x, y);
  }
  return {
    ref,
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      fromEvent(e);
    },
    onPointerMove: (e) => {
      if (e.buttons !== 1) return;
      fromEvent(e);
    },
  };
}

const PICKER_WIDTH = 220;

/** The saturation (x) / value (y, inverted — 1 at top) square for a given hue. */
function SaturationValueBox({ hue, s, v, onChange }) {
  const drag = usePointerDrag((x, y) => onChange(x, 1 - y));
  return (
    <div
      ref={drag.ref}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      style={{
        position: 'relative',
        width: PICKER_WIDTH,
        height: 140,
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--chrome-border-strong)',
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))`,
        cursor: 'crosshair',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `${s * 100}%`,
          top: `${(1 - v) * 100}%`,
          width: 12,
          height: 12,
          borderRadius: '50%',
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

/** A full-spectrum hue slider, 0–360°. */
function HueSlider({ hue, onChange }) {
  const drag = usePointerDrag((x) => onChange(x * 360));
  return (
    <div
      ref={drag.ref}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      style={{
        position: 'relative',
        width: PICKER_WIDTH,
        height: 14,
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--chrome-border-strong)',
        background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
        cursor: 'pointer',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `${(hue / 360) * 100}%`,
          top: '50%',
          width: 6,
          height: 18,
          borderRadius: 3,
          background: '#fff',
          border: '1px solid rgba(0,0,0,0.6)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

/** A small checkerboard-backed square showing `color` (its alpha included), reused for the trigger swatch and the popover's own preview. Square corners, deliberately — rounding a swatch this small produced visible artifacts at the corners. */
function Swatch({ color, size = 24 }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 0,
        border: '1px solid var(--chrome-border-strong)',
        position: 'relative',
        overflow: 'hidden',
        // A 2x2 checkerboard tile so partial alpha is visible — conic-gradient
        // stops need explicit units (bare "0"/"25%" without them is invalid
        // CSS and silently drops the *entire* declaration, not just that
        // stop, which is what happened here before this fix).
        backgroundImage: 'conic-gradient(#ccc 90deg, #fff 90deg 180deg, #ccc 180deg 270deg, #fff 270deg)',
        backgroundSize: '8px 8px',
        backgroundColor: '#fff',
        flexShrink: 0,
      }}
    >
      <span style={{ position: 'absolute', inset: 0, background: color }} />
    </span>
  );
}

/** One R/G/B/A row: a label, a range slider that fills the remaining row width, and a matching-width number box. Every row reserves the same unit-label slot (empty for R/G/B) so all four sliders render at an identical width. */
function ChannelRow({ label, value, max, unit = '', onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, flexShrink: 0 }}>{label}</span>
      <input type="range" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1, minWidth: 0 }} />
      <input type="number" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 48, flexShrink: 0 }} />
      <span style={{ width: 12, flexShrink: 0, color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>{unit}</span>
    </label>
  );
}

/** A traditional saturation/value + hue picker, built from scratch (not a native `<input type="color">` popup, which can't be restyled to match the app) and wrapped in the app's own modal chrome — a preview swatch, an optional Eyedropper (real `EyeDropper` API, feature-detected), and a Select button that closes the modal. Alpha isn't editable here; it's carried through unchanged from whatever the caller already had.
 *
 * Hue is tracked as its own piece of local state (seeded once from the
 * incoming color) rather than re-derived from `rgbHex` on every render —
 * `rgbToHsv` has no meaningful hue to give back once saturation hits 0
 * (grays/white/black), which would otherwise make the hue slider's thumb
 * jump to 0 the moment a fully-desaturated color is reached. */
function ColorPickerModal({ rgbHex, onPick, onClose }) {
  const initial = parseColor(rgbHex) ?? { r: 0, g: 0, b: 0 };
  const [hsv, setHsv] = useState(() => rgbToHsv(initial.r, initial.g, initial.b));
  const [hiddenForEyedropper, setHiddenForEyedropper] = useState(false);

  function commit(next) {
    setHsv(next);
    const { r, g, b } = hsvToRgb(next.h, next.s, next.v);
    onPick(r, g, b);
  }

  async function handleEyedropper() {
    setHiddenForEyedropper(true);
    try {
      const result = await new window.EyeDropper().open();
      const picked = parseColor(result.sRGBHex);
      if (picked) commit(rgbToHsv(picked.r, picked.g, picked.b));
    } catch {
      // user cancelled (Escape) — nothing to do
    } finally {
      setHiddenForEyedropper(false);
    }
  }

  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);

  return (
    <Modal title="Color Picker" onClose={onClose} hidden={hiddenForEyedropper}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <SaturationValueBox hue={hsv.h} s={hsv.s} v={hsv.v} onChange={(s, v) => commit({ ...hsv, s, v })} />
        <HueSlider hue={hsv.h} onChange={(h) => commit({ ...hsv, h })} />
        <Swatch color={composeColor(r, g, b, 1)} size={32} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        {typeof window !== 'undefined' && window.EyeDropper && (
          <button type="button" className="btn" onClick={handleEyedropper}>Eyedropper</button>
        )}
        <button type="button" className="btn" onClick={onClose} style={{ marginLeft: 'auto' }}>Select</button>
      </div>
    </Modal>
  );
}

const POPOVER_WIDTH = 200;

export function ColorAlphaInput({ value, onChange, title, renderSwatch, onDone, doneLabel = 'Done' }) {
  const parsed = parseColor(value) ?? { r: 0, g: 0, b: 0, alpha: 1 };
  const [hexText, setHexText] = useState(value ?? '#000000');
  const [open, setOpen] = useState(false);
  // Viewport-fixed pixel coordinates, not CSS percentage anchoring — a
  // `position: absolute` popover anchored to its trigger gets clipped (and,
  // worse, silently expands the scrollable area, forcing scrollbars) by
  // any scrolling ancestor, which Modal.jsx's own panel is whenever this
  // input is used inside a modal (e.g. the gradient editor's stop colors).
  // `position: fixed` escapes that entirely, at the cost of computing its
  // own coordinates from the trigger's real on-screen position instead of
  // getting it for free from CSS.
  const [fixedPos, setFixedPos] = useState({ top: -9999, left: -9999 });
  const [pickerModalOpen, setPickerModalOpen] = useState(false);
  const rootRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    setHexText(value ?? '#000000');
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Measures the popover against the viewport right after it mounts (but
  // before the browser paints) and repositions above/left as needed, so it
  // never renders partially off-screen regardless of where its trigger
  // sits or what's scrolled/clipped around it.
  useLayoutEffect(() => {
    if (!open || !popoverRef.current || !rootRef.current) return;
    const triggerRect = rootRef.current.getBoundingClientRect();
    const popRect = popoverRef.current.getBoundingClientRect();
    let left = triggerRect.left;
    let top = triggerRect.bottom + 4;
    if (left + popRect.width > window.innerWidth) left = Math.max(4, triggerRect.right - popRect.width);
    if (top + popRect.height > window.innerHeight) top = Math.max(4, triggerRect.top - popRect.height - 4);
    setFixedPos({ top, left });
  }, [open]);

  function commitHexText() {
    const next = parseColor(hexText);
    if (!next) {
      setHexText(value ?? '#000000'); // invalid text — revert rather than silently coerce
      return;
    }
    onChange(composeColor(next.r, next.g, next.b, next.alpha));
  }

  function setChannel(channel, n) {
    const next = { ...parsed, [channel]: channel === 'alpha' ? Math.max(0, Math.min(1, n / 100)) : clamp255(n) };
    onChange(composeColor(next.r, next.g, next.b, next.alpha));
  }

  function handleDone() {
    setOpen(false);
    onDone?.();
  }

  const toggle = () => setOpen((o) => !o);

  return (
    <span ref={rootRef} style={{ display: 'inline-block' }} title={title}>
      {renderSwatch ? (
        renderSwatch({ onClick: toggle })
      ) : (
        <button type="button" onClick={toggle} aria-label="Edit color" style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'none' }}>
          <Swatch color={value ?? '#000000'} />
        </button>
      )}

      {open && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: fixedPos.top,
            left: fixedPos.left,
            zIndex: 10,
            background: 'var(--chrome-bg-panel)',
            border: '1px solid var(--chrome-border)',
            borderRadius: 'var(--radius-sm)',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            width: POPOVER_WIDTH,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Swatch color={value ?? '#000000'} />
            <input
              type="text"
              value={hexText}
              onChange={(e) => setHexText(e.target.value)}
              onBlur={commitHexText}
              onKeyDown={(e) => e.key === 'Enter' && commitHexText()}
              placeholder="#rrggbb"
              style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono, monospace)' }}
            />
          </div>
          <ChannelRow label="R" value={parsed.r} max={255} onChange={(n) => setChannel('r', n)} />
          <ChannelRow label="G" value={parsed.g} max={255} onChange={(n) => setChannel('g', n)} />
          <ChannelRow label="B" value={parsed.b} max={255} onChange={(n) => setChannel('b', n)} />
          <ChannelRow label="A" value={Math.round(parsed.alpha * 100)} max={100} unit="%" onChange={(n) => setChannel('alpha', n)} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" className="btn" onClick={() => setPickerModalOpen(true)}>Color Picker</button>
            <button className="btn" onClick={handleDone}>{doneLabel}</button>
          </div>
        </div>
      )}

      {pickerModalOpen && (
        <ColorPickerModal
          rgbHex={`#${toHex2(parsed.r)}${toHex2(parsed.g)}${toHex2(parsed.b)}`}
          onPick={(r, g, b) => onChange(composeColor(r, g, b, parsed.alpha))}
          onClose={() => setPickerModalOpen(false)}
        />
      )}
    </span>
  );
}
