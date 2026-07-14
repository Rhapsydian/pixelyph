// Bulk-creates empty-grid glyphs, one per codepoint in whichever charset
// presets the user checks. Every codepoint that doesn't already have a
// glyph gets a real, keyed, empty Glyph object (never a browsing-only
// "ghost cell" — GlyphSetPanel only ever iterates real Map entries); any
// codepoint that already has a glyph is left untouched, per
// addGlyphsFromPreset's no-overwrite bulk semantics.

import { useMemo, useState } from 'react';
import { useStore } from '../../state/store.js';
import { CHARSET_PRESETS, CHARSET_PRESET_IDS, mergedPresetCodepoints } from '../../model/charsetPresets.js';
import { Modal, ModalActions } from '../Modal.jsx';

export function BulkAddGlyphsModal() {
  const open = useStore((s) => s.bulkAddModalOpen);
  const setOpen = useStore((s) => s.setBulkAddModalOpen);
  const glyphSet = useStore((s) => s.glyphSet);
  const addGlyphsFromPreset = useStore((s) => s.addGlyphsFromPreset);

  // A font commonly wants more than one preset at once (e.g. Basic Latin
  // *and* Symbols), so this is a multi-select. Seeded from the wizard's
  // initial preset choice, same as the panel this modal replaces did.
  const [presetIds, setPresetIds] = useState(() => {
    const initial = useStore.getState().initialCharsetPreset ?? 'basic-latin';
    return initial === 'none' ? new Set() : new Set([initial]);
  });

  const codepoints = useMemo(() => mergedPresetCodepoints(Array.from(presetIds)), [presetIds]);
  const newCodepoints = useMemo(
    () => (glyphSet ? codepoints.filter((cp) => !glyphSet.glyphs.has(cp)) : []),
    [codepoints, glyphSet],
  );

  if (!open) return null;

  function togglePreset(id) {
    setPresetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleClose() {
    setOpen(false);
  }

  function handleConfirm() {
    addGlyphsFromPreset(newCodepoints);
    setOpen(false);
  }

  const existingCount = codepoints.length - newCodepoints.length;

  return (
    <Modal title="Bulk Add Glyphs" onClose={handleClose}>
      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--chrome-text-muted)', maxWidth: 320 }}>
        Add every codepoint in the checked charset(s) as an empty glyph. Codepoints that already exist are skipped.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {CHARSET_PRESET_IDS.map((id) => (
          <label key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={presetIds.has(id)} onChange={() => togglePreset(id)} />
            {CHARSET_PRESETS[id].label}
          </label>
        ))}
      </div>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--chrome-text-muted)' }}>
        {existingCount > 0
          ? `${newCodepoints.length} new glyphs will be added (${existingCount} already exist)`
          : `${newCodepoints.length} new glyphs will be added`}
      </span>
      <ModalActions onCancel={handleClose} onConfirm={handleConfirm} confirmLabel="Add Glyphs" confirmDisabled={newCodepoints.length === 0} />
    </Modal>
  );
}
