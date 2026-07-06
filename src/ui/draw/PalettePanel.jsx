// The shared swatch library, both tiers. Renamed from PaletteSimple.jsx
// (Phase 9) since it's no longer simple-tier-only: `Canvas.palette` was
// always meant as "a shared swatch list, both tiers" (see the plan), and
// this panel is where that's actually true now — three groups (Colors,
// Gradients & Patterns, Styles), each independently add/remove/reorder/
// clear-able, plus export/import of the whole palette as its own file.
//
// Simple tier only ever shows the Colors group (nothing else has anything
// to apply to in simple tier — a layer's color there is auto-managed per
// paint color, not a per-layer style). Advanced tier shows all three;
// clicking any swatch applies it to the active layer (colors set a solid
// fill, fills clone a gradient/pattern into the fill, styles replace
// fill+stroke+effects wholesale) via `applyPaletteEntryToActiveLayer`.

import { useRef, useState } from 'react';
import { useStore } from '../../state/store.js';
import { ColorAlphaInput } from '../ColorAlphaInput.jsx';
import { FillSwatch } from '../FillSwatch.jsx';
import { IconButton } from '../IconButton.jsx';
import { ChevronDownIcon } from '../icons.jsx';

// icons.jsx has no left/right chevrons yet (only a down one, for selects) —
// reusing MoveUpIcon/MoveDownIcon rotated reads oddly for a horizontal
// swatch row, so these two are rotated ChevronDown variants instead.
function ChevronLeftIcon(props) {
  return <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}><ChevronDownIcon {...props} /></span>;
}
function ChevronRightIcon(props) {
  return <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}><ChevronDownIcon {...props} /></span>;
}

function GroupToolbar({ selected, onMoveLeft, onMoveRight, onClear, clearLabel }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <IconButton icon={<ChevronLeftIcon />} label="Move left" disabled={!selected} onClick={onMoveLeft} />
      <IconButton icon={<ChevronRightIcon />} label="Move right" disabled={!selected} onClick={onMoveRight} />
      <button className="btn" onClick={onClear}>{clearLabel}</button>
    </span>
  );
}

function ColorsGroup({ tier }) {
  const colors = useStore((s) => s.canvas.palette.colors);
  const activeColor = useStore((s) => s.activeColor);
  const setActiveColor = useStore((s) => s.setActiveColor);
  const addPaletteColor = useStore((s) => s.addPaletteColor);
  const removePaletteEntry = useStore((s) => s.removePaletteEntry);
  const reorderPaletteEntry = useStore((s) => s.reorderPaletteEntry);
  const clearPaletteGroup = useStore((s) => s.clearPaletteGroup);
  const applyPaletteEntryToActiveLayer = useStore((s) => s.applyPaletteEntryToActiveLayer);
  const [draftColor, setDraftColor] = useState('#000000');

  function selectColor(color) {
    setActiveColor(color);
    if (tier === 'advanced') applyPaletteEntryToActiveLayer('colors', color);
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
              removePaletteEntry('colors', color);
            }}
            style={{
              width: 24,
              height: 24,
              background: color,
              border: activeColor === color ? '2px solid var(--chrome-text)' : '1px solid var(--chrome-border-strong)',
              borderRadius: 'var(--radius-sm)',
              padding: 0,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <ColorAlphaInput value={draftColor} onChange={setDraftColor} title="New color" />
        <button className="btn" onClick={() => addPaletteColor(draftColor)}>Add</button>
        <GroupToolbar
          selected={colors.includes(activeColor)}
          onMoveLeft={() => reorderPaletteEntry('colors', activeColor, -1)}
          onMoveRight={() => reorderPaletteEntry('colors', activeColor, 1)}
          onClear={() => clearPaletteGroup('colors')}
          clearLabel="Clear colors"
        />
      </div>
    </div>
  );
}

function FillsGroup() {
  const fills = useStore((s) => s.canvas.palette.fills);
  const removePaletteEntry = useStore((s) => s.removePaletteEntry);
  const reorderPaletteEntry = useStore((s) => s.reorderPaletteEntry);
  const clearPaletteGroup = useStore((s) => s.clearPaletteGroup);
  const applyPaletteEntryToActiveLayer = useStore((s) => s.applyPaletteEntryToActiveLayer);
  const [selected, setSelected] = useState(null);

  return (
    <div>
      <strong>Gradients &amp; patterns</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0' }}>
        {fills.map((entry) => (
          <button
            key={entry.id}
            type="button"
            title={entry.type}
            onClick={() => {
              setSelected(entry.id);
              applyPaletteEntryToActiveLayer('fills', entry.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              removePaletteEntry('fills', entry.id);
            }}
            style={{ padding: 0, border: selected === entry.id ? '2px solid var(--chrome-text)' : 'none', borderRadius: 'var(--radius-sm)', lineHeight: 0 }}
          >
            <FillSwatch fill={entry} size={24} title={entry.type} />
          </button>
        ))}
        {fills.length === 0 && <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>Save a gradient (Style tab) or paste a pattern to build this list.</span>}
      </div>
      <GroupToolbar
        selected={fills.some((f) => f.id === selected)}
        onMoveLeft={() => reorderPaletteEntry('fills', selected, -1)}
        onMoveRight={() => reorderPaletteEntry('fills', selected, 1)}
        onClear={() => clearPaletteGroup('fills')}
        clearLabel="Clear gradients & patterns"
      />
    </div>
  );
}

function StylesGroup() {
  const styles = useStore((s) => s.canvas.palette.styles);
  const removePaletteEntry = useStore((s) => s.removePaletteEntry);
  const reorderPaletteEntry = useStore((s) => s.reorderPaletteEntry);
  const clearPaletteGroup = useStore((s) => s.clearPaletteGroup);
  const applyPaletteEntryToActiveLayer = useStore((s) => s.applyPaletteEntryToActiveLayer);
  const [selected, setSelected] = useState(null);

  return (
    <div>
      <strong>Styles</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0' }}>
        {styles.map((entry) => (
          <button
            key={entry.id}
            type="button"
            title={`Saved style${entry.stroke ? ' (with stroke)' : ''}${entry.effects?.length ? `, ${entry.effects.length} effect(s)` : ''}`}
            onClick={() => {
              setSelected(entry.id);
              applyPaletteEntryToActiveLayer('styles', entry.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              removePaletteEntry('styles', entry.id);
            }}
            style={{
              padding: 0,
              border: selected === entry.id ? '2px solid var(--chrome-text)' : `2px solid ${entry.stroke?.color ?? 'transparent'}`,
              borderRadius: 'var(--radius-sm)',
              lineHeight: 0,
            }}
          >
            <FillSwatch fill={entry.fill} size={24} title="Saved style" />
          </button>
        ))}
        {styles.length === 0 && <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>Save a layer's fill+stroke+effects from the Style tab to build this list.</span>}
      </div>
      <GroupToolbar
        selected={styles.some((s) => s.id === selected)}
        onMoveLeft={() => reorderPaletteEntry('styles', selected, -1)}
        onMoveRight={() => reorderPaletteEntry('styles', selected, 1)}
        onClear={() => clearPaletteGroup('styles')}
        clearLabel="Clear styles"
      />
    </div>
  );
}

export function PalettePanel() {
  const tier = useStore((s) => s.canvas.tier);
  const importLospecPalette = useStore((s) => s.importLospecPalette);
  const importPixelyphPalette = useStore((s) => s.importPixelyphPalette);
  const exportPalette = useStore((s) => s.exportPalette);
  const fileInputRef = useRef(null);

  async function handleImportFile(evt) {
    const file = evt.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (!importPixelyphPalette(text)) importLospecPalette(text);
    evt.target.value = '';
  }

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ColorsGroup tier={tier} />

      {tier === 'advanced' && (
        <>
          <FillsGroup />
          <StylesGroup />
          <div style={{ color: 'var(--chrome-text-muted)', fontStyle: 'italic', fontSize: 'var(--text-xs)' }}>
            Save a fill or a whole style to this palette from the Style tab's "Save to palette"/"Save style" buttons.
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--chrome-border)', paddingTop: 8 }}>
        <button className="btn" onClick={() => fileInputRef.current?.click()}>Import palette</button>
        <input ref={fileInputRef} type="file" accept=".hex,.txt,.json" onChange={handleImportFile} style={{ display: 'none' }} />
        <button className="btn" onClick={exportPalette}>Export palette</button>
      </div>
    </div>
  );
}
