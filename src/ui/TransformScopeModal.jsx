// Modal opened from the Transform menu for every Flip/Rotate item in Draw
// mode — always shown, since "Canvas or Layer" (Pixel tier) / "Canvas,
// Layer, or Shape" (Shape tier) is always a real, meaningful choice (even
// with only one layer, flipping "the canvas" and flipping "that one layer"
// are different operations conceptually, just happening to look identical
// today). Glyph mode has no target concept at all (a glyph has no
// layers/shapes), so it never opens this modal — see MenuBar.jsx.
//
// `actionsByTarget` only ever has the keys valid for the current context:
// `canvas`/`layer` always, `shape` only when Shape tier has a real active
// grid to target. The frame-scope checkbox only applies to canvas/layer —
// shape-level flip/rotate has no all-frames concept at all (it only ever
// touches the current frame's one grid, per store.js), so it's hidden
// whenever `shape` is the selected target.

import { useState } from 'react';
import { useStore } from '../state/store.js';
import { Modal, ModalActions } from './Modal.jsx';

const TARGET_LABELS = { canvas: 'Canvas', layer: 'Layer', shape: 'Shape' };

export function TransformScopeModal({ title, actionsByTarget, onClose }) {
  const flipRotateAllFrames = useStore((s) => s.flipRotateAllFrames);
  const setFlipRotateAllFrames = useStore((s) => s.setFlipRotateAllFrames);
  const targets = Object.keys(actionsByTarget);
  const [target, setTarget] = useState(targets.includes('canvas') ? 'canvas' : targets[0]);
  const [allFrames, setAllFrames] = useState(flipRotateAllFrames);

  function handleConfirm() {
    if (target !== 'shape') setFlipRotateAllFrames(allFrames);
    actionsByTarget[target]();
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <fieldset style={{ border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius-sm)' }}>
        <legend>Apply to</legend>
        <div style={{ display: 'flex', gap: 12 }}>
          {targets.map((t) => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="radio" name="transform-target" checked={target === t} onChange={() => setTarget(t)} />
              {TARGET_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>

      {target !== 'shape' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={allFrames} onChange={(e) => setAllFrames(e.target.checked)} />
          Apply to all frames
        </label>
      )}

      <ModalActions onCancel={onClose} onConfirm={handleConfirm} confirmLabel={title} />
    </Modal>
  );
}
