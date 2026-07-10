// Small modal opened from the Transform menu for Flip/Rotate items, only
// when Draw mode has 2+ frames (otherwise there's nothing to choose, so
// the caller runs the action directly with no modal). One setting: whether
// to apply to every frame or just the current one, initialized from the
// existing flipRotateAllFrames store value so the choice still feels
// sticky/remembered across uses even though it's now surfaced per-action
// instead of a standing toolbar checkbox.

import { useState } from 'react';
import { useStore } from '../state/store.js';
import { Modal, ModalActions } from './Modal.jsx';

export function TransformScopeModal({ title, onConfirm, onClose }) {
  const flipRotateAllFrames = useStore((s) => s.flipRotateAllFrames);
  const setFlipRotateAllFrames = useStore((s) => s.setFlipRotateAllFrames);
  const [allFrames, setAllFrames] = useState(flipRotateAllFrames);

  function handleConfirm() {
    setFlipRotateAllFrames(allFrames);
    onConfirm();
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="checkbox" checked={allFrames} onChange={(e) => setAllFrames(e.target.checked)} />
        Apply to all frames
      </label>
      <ModalActions onCancel={onClose} onConfirm={handleConfirm} confirmLabel={title} />
    </Modal>
  );
}
