// Converts an imported raster image into actual paintable grid content
// (downsample + quantize, model/importRaster.js), distinct from
// ReferenceImageLayer's non-exported trace-over guide.

import { useRef, useState } from 'react';
import { useStore } from '../../state/store.js';

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ImportImagePanel() {
  const importRasterImage = useStore((s) => s.importRasterImage);
  const setReferenceImage = useStore((s) => s.setReferenceImage);
  const clearReferenceImage = useStore((s) => s.clearReferenceImage);
  const setReferenceImageOpacity = useStore((s) => s.setReferenceImageOpacity);
  const referenceImage = useStore((s) => s.canvas.referenceImage);
  const fileInputRef = useRef(null);
  const referenceInputRef = useRef(null);
  const [mode, setMode] = useState(/** @type {'nearest'|'average'} */ ('nearest'));
  const [useExistingPalette, setUseExistingPalette] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleFile(evt) {
    const file = evt.target.files?.[0];
    evt.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await importRasterImage(file, { mode, useExistingPalette });
    } finally {
      setBusy(false);
    }
  }

  async function handleReferenceFile(evt) {
    const file = evt.target.files?.[0];
    evt.target.value = '';
    if (!file) return;
    setReferenceImage(await readAsDataUrl(file));
  }

  return (
    <div style={{ padding: '0.5rem', background: '#1e1e1e', color: '#eee', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={() => fileInputRef.current?.click()} disabled={busy}>
        {busy ? 'Importing...' : 'Import Image'}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      <label>
        <select value={mode} onChange={(e) => setMode(/** @type {'nearest'|'average'} */ (e.target.value))}>
          <option value="nearest">Nearest (pixel-art source)</option>
          <option value="average">Average (photo/logo source)</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={useExistingPalette} onChange={(e) => setUseExistingPalette(e.target.checked)} /> Match existing palette
      </label>

      <span style={{ borderLeft: '1px solid #444', paddingLeft: '0.75rem' }}>
        <button onClick={() => referenceInputRef.current?.click()}>Reference Image</button>
        <input ref={referenceInputRef} type="file" accept="image/*" onChange={handleReferenceFile} style={{ display: 'none' }} />
      </span>
      {referenceImage && (
        <>
          <label>
            Opacity:{' '}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={referenceImage.opacity}
              onChange={(e) => setReferenceImageOpacity(Number(e.target.value))}
            />
          </label>
          <button onClick={clearReferenceImage}>Clear Reference</button>
        </>
      )}
    </div>
  );
}
