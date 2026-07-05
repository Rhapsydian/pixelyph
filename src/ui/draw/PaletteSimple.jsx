import { useRef } from 'react';
import { useStore } from '../../state/store.js';

export function PaletteSimple() {
  const palette = useStore((s) => s.canvas.palette);
  const activeColor = useStore((s) => s.activeColor);
  const setActiveColor = useStore((s) => s.setActiveColor);
  const setPalette = useStore((s) => s.setPalette);
  const importLospecPalette = useStore((s) => s.importLospecPalette);
  const fileInputRef = useRef(null);

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
    <div style={{ padding: '0.5rem', background: '#1e1e1e', color: '#eee' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {palette.map((color) => (
          <button
            key={color}
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
              border: activeColor === color ? '2px solid #fff' : '1px solid #555',
              borderRadius: 4,
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
        <input type="color" value={activeColor} onChange={(e) => addColor(e.target.value)} title="Add a color to the palette" style={{ width: 24, height: 24, padding: 0, border: 'none' }} />
      </div>
      <div style={{ marginTop: '0.5rem' }}>
        <button onClick={() => fileInputRef.current?.click()}>Import Lospec palette (.hex)</button>
        <input ref={fileInputRef} type="file" accept=".hex,.txt" onChange={handleLospecFile} style={{ display: 'none' }} />
      </div>
    </div>
  );
}
