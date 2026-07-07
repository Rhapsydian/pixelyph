// "Reference Image…" (File menu, draw mode) — sets/clears the non-exported
// trace-over guide (ReferenceImageLayer), distinct from ImportImageModal
// which actually paints imported pixels onto the canvas. Split out of the
// old always-visible ImportImagePanel row into its own modal for the same
// reason as ImportImageModal: these are occasional-use settings, not
// permanent screen real estate.

import { useRef } from 'react';
import { useStore } from '../state/store.js';
import { Modal } from './Modal.jsx';
import { PercentSlider } from './PercentSlider.jsx';

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ReferenceImageModal() {
  const open = useStore((s) => s.referenceImageModalOpen);
  const setOpen = useStore((s) => s.setReferenceImageModalOpen);
  const setReferenceImage = useStore((s) => s.setReferenceImage);
  const clearReferenceImage = useStore((s) => s.clearReferenceImage);
  const setReferenceImageOpacity = useStore((s) => s.setReferenceImageOpacity);
  const referenceImage = useStore((s) => s.canvas?.referenceImage);
  const fileInputRef = useRef(null);

  if (!open) return null;

  async function handleFile(evt) {
    const file = evt.target.files?.[0];
    evt.target.value = '';
    if (!file) return;
    setReferenceImage(await readAsDataUrl(file));
  }

  return (
    <Modal title="Reference Image" onClose={() => setOpen(false)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 280 }}>
        <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>
          A trace-over guide shown behind the canvas — never included in any export.
        </span>
        <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} style={{ alignSelf: 'flex-start' }}>
          {referenceImage ? 'Replace Image…' : 'Choose Image…'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        {referenceImage && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Opacity:
              <PercentSlider value={referenceImage.opacity} onChange={setReferenceImageOpacity} title="Reference image opacity" />
            </label>
            <button className="btn" onClick={clearReferenceImage} style={{ alignSelf: 'flex-start' }}>Clear Reference</button>
          </>
        )}
      </div>
    </Modal>
  );
}
