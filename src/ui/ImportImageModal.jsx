// "Import Image…" (File menu, draw mode) — converts a raster image into
// actual paintable grid content (downsample + quantize, model/importRaster.js).
// Split out of the old always-visible ImportImagePanel side-panel row: the
// settings (downsampling mode, palette matching) only matter in the instant
// you're about to import, so they're a modal now rather than permanent
// screen real estate. Distinct from ReferenceImageModal, which sets a
// non-exported trace-over guide instead of touching the canvas's pixels.

import { useRef, useState } from 'react';
import { useStore } from '../state/store.js';
import { Modal, ModalActions } from './Modal.jsx';

export function ImportImageModal() {
  const open = useStore((s) => s.importImageModalOpen);
  const setOpen = useStore((s) => s.setImportImageModalOpen);
  const importRasterImage = useStore((s) => s.importRasterImage);
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState(/** @type {'nearest'|'average'} */ ('nearest'));
  const [useExistingPalette, setUseExistingPalette] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handleFile(evt) {
    const file = evt.target.files?.[0];
    evt.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await importRasterImage(file, { mode, useExistingPalette });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Import Image" onClose={() => setOpen(false)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 280 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Downsampling
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="nearest">Nearest (pixel-art source)</option>
            <option value="average">Average (photo/logo source)</option>
          </select>
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={useExistingPalette} onChange={(e) => setUseExistingPalette(e.target.checked)} />
          Match existing palette
        </label>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      </div>
      <ModalActions
        onCancel={() => setOpen(false)}
        onConfirm={() => fileInputRef.current?.click()}
        confirmLabel={busy ? 'Importing…' : 'Choose Image…'}
        confirmDisabled={busy}
      />
    </Modal>
  );
}
