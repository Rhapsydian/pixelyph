// window.confirm replacement — a themed modal driven by the store's
// `confirmDialog` state (see store.js's `requestConfirm`/`resolveConfirm`).
// Self-contained like AboutModal: renders null when no confirm is pending.

import { useStore } from '../state/store.js';
import { Modal, ModalActions } from './Modal.jsx';

export function ConfirmModal() {
  const confirmDialog = useStore((s) => s.confirmDialog);
  const resolveConfirm = useStore((s) => s.resolveConfirm);

  if (!confirmDialog) return null;

  return (
    <Modal title="Confirm" onClose={() => resolveConfirm(false)}>
      <div style={{ maxWidth: 360 }}>{confirmDialog.message}</div>
      <ModalActions onCancel={() => resolveConfirm(false)} onConfirm={() => resolveConfirm(true)} />
    </Modal>
  );
}
