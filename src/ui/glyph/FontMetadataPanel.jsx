// Form for FontMeta: familyName/styleName/unitsPerEm/ascender/descender/
// baselineRow/iconTilePadding are safe to edit anytime (they only affect
// export-time scaling math, not stored pixel data). pixelsPerEm is the one
// exception — changing it crops or pads every existing glyph's grid
// (GlyphSet.resizeGlyphSet), so it gets its own confirm-before-destructive
// prompt rather than the plain commit-on-blur the other fields use.

import { useState } from 'react';
import { useStore } from '../../state/store.js';

const FIELDS = [
  { key: 'familyName', label: 'Family Name', type: 'text' },
  { key: 'styleName', label: 'Style Name', type: 'text' },
  { key: 'unitsPerEm', label: 'Units per Em', type: 'number' },
  { key: 'ascender', label: 'Ascender', type: 'number' },
  { key: 'descender', label: 'Descender', type: 'number' },
  { key: 'baselineRow', label: 'Baseline Row', type: 'number' },
  { key: 'iconTilePadding', label: 'Icon Tile Padding', type: 'number' },
];

function FieldInput({ type, value, onCommit }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      type={type}
      value={draft}
      onChange={(e) => setDraft(type === 'number' ? Number(e.target.value) : e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      style={{ width: type === 'number' ? 70 : 140 }}
    />
  );
}

export function FontMetadataPanel() {
  const glyphSet = useStore((s) => s.glyphSet);
  const updateFontMeta = useStore((s) => s.updateFontMeta);
  const resizeFontPixelsPerEm = useStore((s) => s.resizeFontPixelsPerEm);
  const requestConfirm = useStore((s) => s.requestConfirm);
  const [pixelsPerEmDraft, setPixelsPerEmDraft] = useState(glyphSet?.meta.pixelsPerEm ?? 16);

  if (!glyphSet) return null;
  const { meta } = glyphSet;

  async function commitPixelsPerEm() {
    const next = Number(pixelsPerEmDraft);
    if (!Number.isFinite(next) || next < 1 || next === meta.pixelsPerEm) {
      setPixelsPerEmDraft(meta.pixelsPerEm);
      return;
    }
    if (
      glyphSet.glyphs.size > 0 &&
      !(await requestConfirm(
        `Changing pixels-per-em from ${meta.pixelsPerEm} to ${next} crops or pads every existing glyph's grid — already-drawn pixels near the edge may be cut off. Continue?`,
      ))
    ) {
      setPixelsPerEmDraft(meta.pixelsPerEm);
      return;
    }
    resizeFontPixelsPerEm(next);
  }

  return (
    <div className="panel">
      <strong>Font Metadata</strong>
      {FIELDS.map(({ key, label, type }) => (
        <label key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          {label}
          <FieldInput type={type} value={meta[key]} onCommit={(value) => updateFontMeta({ [key]: value })} />
        </label>
      ))}
      <label style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }} title="Glyph grid height, uniform across the font — changing this crops or pads every glyph">
        Pixels per Em
        <input type="number" min={1} value={pixelsPerEmDraft} onChange={(e) => setPixelsPerEmDraft(e.target.value)} onBlur={commitPixelsPerEm} style={{ width: 70 }} />
      </label>
    </div>
  );
}
