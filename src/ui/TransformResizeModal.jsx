// Resize modal opened from the Transform menu — relocates ContextBar.jsx's
// old inline CanvasSizeControl/GlyphSizeControl into a proper modal, with
// the old plain <select> anchor swapped for AnchorGrid's 3x3 picker (same
// 9-string anchor enum, no other behavior change). Mode-aware: Draw mode
// gets width+height+anchor; Glyph mode gets width+anchor only, matching
// resizeActiveGlyph's own (newWidth, anchor) signature — anchor wasn't
// exposed in the old glyph control, this is a small added capability since
// the store action already accepted one.

import { useState } from 'react';
import { useStore } from '../state/store.js';
import { Modal, ModalActions } from './Modal.jsx';
import { AnchorGrid } from './AnchorGrid.jsx';

export function TransformResizeModal({ onClose }) {
  const mode = useStore((s) => s.mode);
  const canvas = useStore((s) => s.canvas);
  const resizeCanvas = useStore((s) => s.resizeCanvas);
  const activeCodepoint = useStore((s) => s.activeCodepoint);
  const glyphSet = useStore((s) => s.glyphSet);
  const resizeActiveGlyph = useStore((s) => s.resizeActiveGlyph);

  const glyph = mode === 'glyph' && activeCodepoint != null ? glyphSet?.glyphs.get(activeCodepoint) : null;

  const [width, setWidth] = useState(mode === 'glyph' ? (glyph?.width ?? 1) : canvas.width);
  const [height, setHeight] = useState(canvas.height);
  const [anchor, setAnchor] = useState('top-left');

  if (mode === 'glyph' && !glyph) return null;

  function handleResize() {
    if (mode === 'glyph') resizeActiveGlyph(width, anchor);
    else resizeCanvas(width, height, anchor);
    onClose();
  }

  return (
    <Modal title={mode === 'glyph' ? 'Resize Glyph' : 'Resize Canvas'} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label>
          Width: <input type="number" min={1} max={mode === 'glyph' ? 256 : 512} value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ width: 56 }} />
        </label>
        {mode !== 'glyph' && (
          <label>
            Height: <input type="number" min={1} max={512} value={height} onChange={(e) => setHeight(Number(e.target.value))} style={{ width: 56 }} />
          </label>
        )}
      </div>
      <div>
        <div style={{ marginBottom: 4 }}>Anchor:</div>
        <AnchorGrid value={anchor} onChange={setAnchor} />
      </div>
      <ModalActions onCancel={onClose} onConfirm={handleResize} confirmLabel="Resize" />
    </Modal>
  );
}
