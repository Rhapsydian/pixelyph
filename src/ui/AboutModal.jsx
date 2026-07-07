// Help menu's "About Pixelyph" — a quick-info modal (name, description,
// version). "Visit on GitHub" is a separate, direct-action Help menu item
// (MenuBar.jsx) rather than a button inside this modal, matching how the two
// were asked for as distinct entries.

import { useStore } from '../state/store.js';
import { Modal } from './Modal.jsx';
import pkg from '../../package.json';

export function AboutModal() {
  const open = useStore((s) => s.aboutModalOpen);
  const setOpen = useStore((s) => s.setAboutModalOpen);

  if (!open) return null;

  return (
    <Modal title="About Pixelyph" onClose={() => setOpen(false)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 280 }}>
        <p style={{ margin: 0 }}>{pkg.description}</p>
        <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>Version {pkg.version}</span>
        <button className="btn" onClick={() => setOpen(false)} style={{ alignSelf: 'flex-end' }}>Close</button>
      </div>
    </Modal>
  );
}
