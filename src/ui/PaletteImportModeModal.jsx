// Asks Cancel / Add / Replace when importing a palette generated from an
// image — a 3-way choice ConfirmModal's binary resolve doesn't fit, so this
// is its own small modal driven by the store's paletteImportModeDialog (see
// store.js's requestPaletteImportMode/resolvePaletteImportMode).

import { useStore } from '../state/store.js';
import { Modal, ModalFooter } from './Modal.jsx';

export function PaletteImportModeModal() {
  const dialog = useStore((s) => s.paletteImportModeDialog);
  const resolve = useStore((s) => s.resolvePaletteImportMode);

  if (!dialog) return null;

  return (
    <Modal title="Import Palette from Image" onClose={() => resolve(null)}>
      <div style={{ maxWidth: 360 }}>
        Add the image's colors to the current palette, or replace the whole palette with them?
      </div>
      <ModalFooter justify="space-between">
        <button className="btn" onClick={() => resolve(null)}>Cancel</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => resolve('add')}>Add</button>
          <button className="btn btn-primary" onClick={() => resolve('replace')}>Replace</button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
