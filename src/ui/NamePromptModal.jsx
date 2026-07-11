// Text-input replacement for a window.prompt — a themed modal driven by the
// store's `nameDialog` state (see store.js's `requestName`/`resolveName`).
// Self-contained like ConfirmModal: renders null when no prompt is pending.

import { useEffect, useState } from 'react';
import { useStore } from '../state/store.js';
import { Modal, ModalActions } from './Modal.jsx';

export function NamePromptModal() {
  const nameDialog = useStore((s) => s.nameDialog);
  const resolveName = useStore((s) => s.resolveName);
  const [name, setName] = useState('');

  // The modal stays mounted (renders null below) between separate dialogs,
  // so `name` needs to reset explicitly per `nameDialog` rather than relying
  // on useState's mount-time initializer.
  useEffect(() => {
    setName(nameDialog?.defaultValue ?? '');
  }, [nameDialog]);

  if (!nameDialog) return null;

  function confirm() {
    resolveName(name.trim());
  }

  return (
    <Modal title={nameDialog.label} onClose={() => resolveName(null)}>
      <input
        type="text"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirm();
        }}
        style={{ minWidth: 240 }}
      />
      <ModalActions onCancel={() => resolveName(null)} onConfirm={confirm} />
    </Modal>
  );
}
