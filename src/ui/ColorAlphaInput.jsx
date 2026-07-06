// Color+alpha input, rebuilt for Phase 9: a hex text field (accepts 3/4/6/8
// digit shorthand) with a live preview square, an RGBA popover (opened by
// clicking the preview — mirrors MenuBar.jsx's outside-click/Escape-to-
// close pattern and its zIndex: 10 convention) for direct R/G/B/A editing,
// an always-visible alpha slider+% box (PercentSlider.jsx — alpha stays a
// one-glance, one-drag control, not buried in the popover), and a quick-
// pick strip of the shared palette's colors. Composes to/parses from one
// #RRGGBB or #RRGGBBAA string, same wire format as before — no model
// change, just a richer input surface.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store.js';
import { PercentSlider } from './PercentSlider.jsx';

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

export function ColorAlphaInput({ value, onChange, title }) {
  const paletteColors = useStore((s) => s.canvas.palette.colors);
  const addPaletteColor = useStore((s) => s.addPaletteColor);

  const parsed = parseColor(value) ?? { r: 0, g: 0, b: 0, alpha: 1 };
  const [hexText, setHexText] = useState(value ?? '#000000');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

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

  function commitHexText() {
    const next = parseColor(hexText);
    if (!next) {
      setHexText(value ?? '#000000'); // invalid text — revert rather than silently coerce
      return;
    }
    onChange(composeColor(next.r, next.g, next.b, next.alpha));
  }

  function setChannel(channel, n) {
    const next = { ...parsed, [channel]: clamp255(n) };
    onChange(composeColor(next.r, next.g, next.b, next.alpha));
  }

  function setAlpha(alpha) {
    onChange(composeColor(parsed.r, parsed.g, parsed.b, alpha));
  }

  return (
    <span ref={rootRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }} title={title}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Edit color"
        style={{
          width: 22,
          height: 22,
          padding: 0,
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--chrome-border-strong)',
          position: 'relative',
          overflow: 'hidden',
          backgroundImage: 'repeating-conic-gradient(#ccc 0 25%, #fff 0 25% 50%) 0 0/8px 8px',
          backgroundColor: '#fff',
        }}
      >
        <span style={{ position: 'absolute', inset: 0, background: value ?? '#000000' }} />
      </button>

      <input
        type="text"
        value={hexText}
        onChange={(e) => setHexText(e.target.value)}
        onBlur={commitHexText}
        onKeyDown={(e) => e.key === 'Enter' && commitHexText()}
        placeholder="#rrggbb"
        style={{ width: 84, fontFamily: 'var(--font-mono, monospace)' }}
      />

      <PercentSlider value={parsed.alpha} onChange={setAlpha} title="Alpha" />

      {paletteColors.length > 0 && (
        <span style={{ display: 'inline-flex', gap: 3, maxWidth: 130, overflowX: 'auto' }}>
          {paletteColors.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => {
                const p = parseColor(c);
                if (p) onChange(composeColor(p.r, p.g, p.b, parsed.alpha));
              }}
              style={{ width: 14, height: 14, flexShrink: 0, padding: 0, borderRadius: 3, background: c, border: '1px solid var(--chrome-border-strong)' }}
            />
          ))}
        </span>
      )}
      <button
        type="button"
        title="Add current color to the palette"
        onClick={() => addPaletteColor(composeColor(parsed.r, parsed.g, parsed.b, parsed.alpha))}
        style={{ width: 14, height: 14, flexShrink: 0, padding: 0, borderRadius: 3, border: '1px dashed var(--chrome-border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, lineHeight: 1, color: 'var(--chrome-text-muted)' }}
      >
        +
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            zIndex: 10,
            background: 'var(--chrome-bg-panel)',
            border: '1px solid var(--chrome-border)',
            borderRadius: 'var(--radius-sm)',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            width: 170,
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            R
            <input type="range" min={0} max={255} value={parsed.r} onChange={(e) => setChannel('r', Number(e.target.value))} style={{ flex: 1 }} />
            <input type="number" min={0} max={255} value={parsed.r} onChange={(e) => setChannel('r', Number(e.target.value))} style={{ width: 44 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            G
            <input type="range" min={0} max={255} value={parsed.g} onChange={(e) => setChannel('g', Number(e.target.value))} style={{ flex: 1 }} />
            <input type="number" min={0} max={255} value={parsed.g} onChange={(e) => setChannel('g', Number(e.target.value))} style={{ width: 44 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            B
            <input type="range" min={0} max={255} value={parsed.b} onChange={(e) => setChannel('b', Number(e.target.value))} style={{ flex: 1 }} />
            <input type="number" min={0} max={255} value={parsed.b} onChange={(e) => setChannel('b', Number(e.target.value))} style={{ width: 44 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            A
            <PercentSlider value={parsed.alpha} onChange={setAlpha} title="Alpha" />
          </label>
        </div>
      )}
    </span>
  );
}
