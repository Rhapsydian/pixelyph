// Reorder/rename/delete for the shared palette — opened from the header's
// Palette menu or the Palette panel's own "Manage" button (both just flip
// the same store-level `manageSwatchesOpen` boolean, so there's one modal
// instance regardless of which entry point was used). Colors have no
// separate name from their hex value, so only Gradients/Styles get a
// rename field; all three groups get move-left/move-right (reviving the
// button-based reordering that used to sit inline in the Palette panel,
// now scoped to this dedicated management view) and delete.

import { useStore } from '../state/store.js';
import { Modal } from './Modal.jsx';
import { FillSwatch } from './FillSwatch.jsx';
import { IconButton } from './IconButton.jsx';
import { ChevronDownIcon, TrashIcon } from './icons.jsx';

function ChevronLeftIcon(props) {
  return <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}><ChevronDownIcon {...props} /></span>;
}
function ChevronRightIcon(props) {
  return <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}><ChevronDownIcon {...props} /></span>;
}

function SwatchRow({ swatch, label, isFirst, isLast, onMoveLeft, onMoveRight, onRename, onDelete }) {
  return (
    <div className="row" style={{ alignItems: 'center', gap: 8 }}>
      {swatch}
      {onRename ? (
        <input
          value={label ?? ''}
          onChange={(e) => onRename(e.target.value)}
          placeholder="(unnamed)"
          style={{ flex: 1, minWidth: 0 }}
        />
      ) : (
        <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono, monospace)' }}>{label}</span>
      )}
      <IconButton icon={<ChevronLeftIcon />} label="Move left" disabled={isFirst} onClick={onMoveLeft} />
      <IconButton icon={<ChevronRightIcon />} label="Move right" disabled={isLast} onClick={onMoveRight} />
      <IconButton icon={<TrashIcon />} label="Delete" onClick={onDelete} />
    </div>
  );
}

function ColorsSection() {
  const colors = useStore((s) => s.canvas.palette.colors);
  const reorderPaletteEntry = useStore((s) => s.reorderPaletteEntry);
  const removePaletteEntry = useStore((s) => s.removePaletteEntry);

  if (colors.length === 0) return null;
  return (
    <div>
      <strong>Colors</strong>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        {colors.map((color, i) => (
          <SwatchRow
            key={color}
            swatch={<span style={{ width: 24, height: 24, flexShrink: 0, background: color, border: '1px solid var(--chrome-border-strong)' }} />}
            label={color}
            isFirst={i === 0}
            isLast={i === colors.length - 1}
            onMoveLeft={() => reorderPaletteEntry('colors', color, -1)}
            onMoveRight={() => reorderPaletteEntry('colors', color, 1)}
            onDelete={() => removePaletteEntry('colors', color)}
          />
        ))}
      </div>
    </div>
  );
}

function FillsSection() {
  const fills = useStore((s) => s.canvas.palette.fills);
  const reorderPaletteEntry = useStore((s) => s.reorderPaletteEntry);
  const renamePaletteEntry = useStore((s) => s.renamePaletteEntry);
  const removePaletteEntry = useStore((s) => s.removePaletteEntry);

  if (fills.length === 0) return null;
  return (
    <div>
      <strong>Gradients</strong>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        {fills.map((entry, i) => (
          <SwatchRow
            key={entry.id}
            swatch={<FillSwatch fill={entry} size={24} title={entry.type} />}
            label={entry.name}
            isFirst={i === 0}
            isLast={i === fills.length - 1}
            onMoveLeft={() => reorderPaletteEntry('fills', entry.id, -1)}
            onMoveRight={() => reorderPaletteEntry('fills', entry.id, 1)}
            onRename={(name) => renamePaletteEntry('fills', entry.id, name)}
            onDelete={() => removePaletteEntry('fills', entry.id)}
          />
        ))}
      </div>
    </div>
  );
}

function StylesSection() {
  const styles = useStore((s) => s.canvas.palette.styles);
  const reorderPaletteEntry = useStore((s) => s.reorderPaletteEntry);
  const renamePaletteEntry = useStore((s) => s.renamePaletteEntry);
  const removePaletteEntry = useStore((s) => s.removePaletteEntry);

  if (styles.length === 0) return null;
  return (
    <div>
      <strong>Styles</strong>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        {styles.map((entry, i) => (
          <SwatchRow
            key={entry.id}
            swatch={<FillSwatch fill={entry.fill} size={24} title="Saved style" />}
            label={entry.name}
            isFirst={i === 0}
            isLast={i === styles.length - 1}
            onMoveLeft={() => reorderPaletteEntry('styles', entry.id, -1)}
            onMoveRight={() => reorderPaletteEntry('styles', entry.id, 1)}
            onRename={(name) => renamePaletteEntry('styles', entry.id, name)}
            onDelete={() => removePaletteEntry('styles', entry.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function ManageSwatchesModal() {
  const open = useStore((s) => s.manageSwatchesOpen);
  const setOpen = useStore((s) => s.setManageSwatchesOpen);
  const colors = useStore((s) => s.canvas.palette.colors);
  const fills = useStore((s) => s.canvas.palette.fills);
  const styles = useStore((s) => s.canvas.palette.styles);

  if (!open) return null;

  const isEmpty = colors.length === 0 && fills.length === 0 && styles.length === 0;

  return (
    <Modal title="Manage Swatches" onClose={() => setOpen(false)}>
      <div style={{ width: 320, maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isEmpty && <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>The palette is empty — nothing to manage yet.</span>}
        <ColorsSection />
        <FillsSection />
        <StylesSection />
      </div>
      <button className="btn" onClick={() => setOpen(false)} style={{ alignSelf: 'flex-end' }}>Done</button>
    </Modal>
  );
}
