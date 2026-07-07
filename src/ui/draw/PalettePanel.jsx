// The shared swatch library, both tiers. Renamed from PaletteSimple.jsx
// (Phase 9) since it's no longer simple-tier-only: `Canvas.palette` was
// always meant as "a shared swatch list, both tiers" (see the plan), and
// this panel is where that's actually true now — three groups (Colors,
// Gradients, Styles — the palette's fills group was originally "Gradients
// & Patterns," but pattern fills were removed, see BACKLOG.md), each
// independently add-able. Right-click removes a single entry (with a
// confirmation — deleting a swatch can't be undone from here); reordering/
// renaming move to the dedicated "Manage Swatches" modal (Palette menu, or
// the "Manage" button below) rather than living inline in this panel.
//
// Simple tier only ever shows the Colors group (nothing else has anything
// to apply to in simple tier — a layer's color there is auto-managed per
// paint color, not a per-layer style). Advanced tier shows all three;
// clicking any swatch applies it to the active layer (colors set a solid
// fill, gradients clone into the fill, styles replace fill+stroke+effects
// wholesale) via `applyPaletteEntryToActiveLayer`.

import { useState } from 'react';
import { useStore } from '../../state/store.js';
import { ColorAlphaInput } from '../ColorAlphaInput.jsx';
import { FillSwatch } from '../FillSwatch.jsx';
import { GradientEditorModal } from '../GradientEditorModal.jsx';

const DEFAULT_GRADIENT = { type: 'linear-gradient', angle: 0, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] };

function DashedPlusSwatch({ onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: 24,
        height: 24,
        padding: 0,
        border: '1px dashed var(--chrome-border-strong)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--chrome-text-muted)',
        fontSize: 'var(--text-sm)',
        lineHeight: 1,
      }}
    >
      +
    </button>
  );
}

function ColorsGroup({ tier }) {
  const colors = useStore((s) => s.canvas.palette.colors);
  const activeColor = useStore((s) => s.activeColor);
  const setActiveColor = useStore((s) => s.setActiveColor);
  const addPaletteColor = useStore((s) => s.addPaletteColor);
  const removePaletteEntry = useStore((s) => s.removePaletteEntry);
  const applyPaletteEntryToActiveLayer = useStore((s) => s.applyPaletteEntryToActiveLayer);
  const [draftColor, setDraftColor] = useState('#000000');

  function selectColor(color) {
    setActiveColor(color);
    if (tier === 'advanced') applyPaletteEntryToActiveLayer('colors', color);
  }

  function confirmDelete(color) {
    if (window.confirm(`Remove ${color} from the palette?`)) removePaletteEntry('colors', color);
  }

  return (
    <div>
      <strong>Colors</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0' }}>
        {colors.map((color) => (
          <button
            key={color}
            className="swatch"
            title={color}
            onClick={() => selectColor(color)}
            onContextMenu={(e) => {
              e.preventDefault();
              confirmDelete(color);
            }}
            style={{
              width: 24,
              height: 24,
              background: color,
              border: activeColor === color ? '2px solid var(--chrome-text)' : '1px solid var(--chrome-border-strong)',
              borderRadius: 0,
              padding: 0,
            }}
          />
        ))}
        <ColorAlphaInput
          value={draftColor}
          onChange={setDraftColor}
          title="Add a new color"
          renderSwatch={(props) => <DashedPlusSwatch {...props} title="Add a new color" />}
          doneLabel="Select"
          onDone={() => {
            addPaletteColor(draftColor);
            setDraftColor('#000000');
          }}
        />
      </div>
    </div>
  );
}

function FillsGroup() {
  const fills = useStore((s) => s.canvas.palette.fills);
  const addPaletteFill = useStore((s) => s.addPaletteFill);
  const removePaletteEntry = useStore((s) => s.removePaletteEntry);
  const applyPaletteEntryToActiveLayer = useStore((s) => s.applyPaletteEntryToActiveLayer);
  const [selected, setSelected] = useState(null);
  const [draftGradient, setDraftGradient] = useState(null); // non-null while the "add" modal is open

  function confirmDelete(entry) {
    if (window.confirm('Remove this gradient from the palette?')) removePaletteEntry('fills', entry.id);
  }

  function closeAddGradient() {
    if (draftGradient) addPaletteFill(draftGradient);
    setDraftGradient(null);
  }

  return (
    <div>
      <strong>Gradients</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0' }}>
        {fills.map((entry) => (
          <button
            key={entry.id}
            type="button"
            title={entry.name || entry.type}
            onClick={() => {
              setSelected(entry.id);
              applyPaletteEntryToActiveLayer('fills', entry.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              confirmDelete(entry);
            }}
            style={{ width: 24, height: 24, padding: 0, border: `2px solid ${selected === entry.id ? 'var(--chrome-text)' : 'transparent'}`, lineHeight: 0 }}
          >
            <FillSwatch fill={entry} size={24} title={entry.name || entry.type} />
          </button>
        ))}
        <DashedPlusSwatch title="Add a new gradient" onClick={() => setDraftGradient(DEFAULT_GRADIENT)} />
      </div>

      {draftGradient && <GradientEditorModal gradient={draftGradient} onChange={setDraftGradient} onClose={closeAddGradient} />}
    </div>
  );
}

function StylesGroup() {
  const styles = useStore((s) => s.canvas.palette.styles);
  const removePaletteEntry = useStore((s) => s.removePaletteEntry);
  const applyPaletteEntryToActiveLayer = useStore((s) => s.applyPaletteEntryToActiveLayer);
  const [selected, setSelected] = useState(null);

  function confirmDelete(entry) {
    if (window.confirm('Remove this saved style from the palette?')) removePaletteEntry('styles', entry.id);
  }

  return (
    <div>
      <strong>Styles</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0' }}>
        {styles.map((entry) => (
          <button
            key={entry.id}
            type="button"
            title={entry.name || `Saved style${entry.stroke ? ' (with stroke)' : ''}${entry.effects?.length ? `, ${entry.effects.length} effect(s)` : ''}`}
            onClick={() => {
              setSelected(entry.id);
              applyPaletteEntryToActiveLayer('styles', entry.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              confirmDelete(entry);
            }}
            style={{
              width: 24,
              height: 24,
              padding: 0,
              border: `2px solid ${selected === entry.id ? 'var(--chrome-text)' : (entry.stroke?.color ?? 'transparent')}`,
              lineHeight: 0,
            }}
          >
            <FillSwatch fill={entry.fill} size={24} title={entry.name || 'Saved style'} />
          </button>
        ))}
        {styles.length === 0 && <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>Save a layer's fill+stroke+effects from the Style tab to build this list.</span>}
      </div>
    </div>
  );
}

export function PalettePanel() {
  const tier = useStore((s) => s.canvas.tier);
  const setManageSwatchesOpen = useStore((s) => s.setManageSwatchesOpen);

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ color: 'var(--chrome-text-muted)', fontStyle: 'italic', fontSize: 'var(--text-xs)' }}>
        Right-click a swatch to remove it (with confirmation).
      </div>

      <ColorsGroup tier={tier} />

      {tier === 'advanced' && (
        <>
          <FillsGroup />
          <StylesGroup />
          <div style={{ color: 'var(--chrome-text-muted)', fontStyle: 'italic', fontSize: 'var(--text-xs)' }}>
            Save a fill or a whole style to this palette using the arrow-to-palette icon button in the Style tab.
          </div>
        </>
      )}

      <button className="btn" onClick={() => setManageSwatchesOpen(true)} style={{ alignSelf: 'flex-start' }}>Manage…</button>
    </div>
  );
}
