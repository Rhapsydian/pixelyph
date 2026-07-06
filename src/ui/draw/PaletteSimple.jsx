import { useRef } from 'react';
import { useStore } from '../../state/store.js';

export function PaletteSimple() {
  const tier = useStore((s) => s.canvas.tier);
  const palette = useStore((s) => s.canvas.palette);
  const activeColor = useStore((s) => s.activeColor);
  const setActiveColor = useStore((s) => s.setActiveColor);
  const setPalette = useStore((s) => s.setPalette);
  const importLospecPalette = useStore((s) => s.importLospecPalette);
  const fileInputRef = useRef(null);

  // The swatch-picker sets `activeColor`, but advanced-tier painting doesn't
  // route through it at all (a layer's own Fill governs its color) — showing
  // live, clickable swatches here would be actively misleading about what
  // they do, so swap in a pointer to the real control instead.
  if (tier === 'advanced') {
    return (
      <div className="panel" style={{ color: 'var(--chrome-text-muted)', fontStyle: 'italic' }}>
        Color is per-layer in advanced tier — use the Fill section in the Style tab.
      </div>
    );
  }

  function addColor(color) {
    if (palette.includes(color)) return;
    setPalette([...palette, color]);
  }

  function removeColor(color) {
    setPalette(palette.filter((c) => c !== color));
    if (activeColor === color && palette.length > 1) setActiveColor(palette.find((c) => c !== color));
  }

  async function handleLospecFile(evt) {
    const file = evt.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    importLospecPalette(text);
    evt.target.value = '';
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {palette.map((color) => (
          <button
            key={color}
            className="swatch"
            title={color}
            onClick={() => setActiveColor(color)}
            onContextMenu={(e) => {
              e.preventDefault();
              removeColor(color);
            }}
            style={{
              width: 24,
              height: 24,
              background: color,
              border: activeColor === color ? '2px solid var(--chrome-text)' : '1px solid var(--chrome-border-strong)',
              borderRadius: 'var(--radius-sm)',
              padding: 0,
            }}
          />
        ))}
        <input type="color" value={activeColor} onChange={(e) => addColor(e.target.value)} title="Add a color to the palette" style={{ width: 24, height: 24, padding: 0, border: 'none' }} />
      </div>
      <div>
        <button className="btn" onClick={() => fileInputRef.current?.click()}>Import Lospec palette (.hex)</button>
        <input ref={fileInputRef} type="file" accept=".hex,.txt" onChange={handleLospecFile} style={{ display: 'none' }} />
      </div>
    </div>
  );
}
