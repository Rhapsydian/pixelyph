// Character-kind sets only (see GlyphSetPanel for the shared thumbnail
// browser both kinds use, and for icon-kind's separate "add by name" flow).
// One cell per codepoint across every checked preset (presets are a
// multi-select — a font commonly wants Basic Latin *and* Card Suits, not
// just one), showing an existing glyph's thumbnail or an empty placeholder —
// progress through a charset visible at a glance. Assignment is direct: type
// the character itself, or U+00E9 for anything awkward to type, into the
// input below; either creates the glyph (if new) and opens it — this works
// for any codepoint regardless of which presets are checked, since presets
// are only a browsing convenience, not a whitelist. Reusing an already-
// assigned codepoint prompts to confirm replacing it (GlyphSet.wouldCollide),
// the same confirm-before-destructive pattern as Draw mode's tier toggle.

import { useMemo, useState } from 'react';
import { useStore } from '../../state/store.js';
import { CHARSET_PRESETS, CHARSET_PRESET_IDS, mergedPresetCodepoints } from '../../model/charsetPresets.js';
import { wouldCollide } from '../../model/GlyphSet.js';
import { GlyphThumbnail } from './GlyphThumbnail.jsx';
import { CloseIcon } from '../icons.jsx';

const CELL_BORDER = {
  active:      { border: '1px solid var(--chrome-accent)', background: 'var(--chrome-accent-soft)' },
  hasGlyph:    { border: '1px solid var(--chrome-border-strong)', background: 'transparent' },
  pendingCreate: { border: '1px solid var(--chrome-warning)', background: 'var(--chrome-bg-raised)' },
  empty:       { border: '1px solid transparent', background: 'transparent' },
};

function parseCodepointInput(text) {
  const trimmed = text.trim();
  const match = /^u\+([0-9a-f]+)$/i.exec(trimmed);
  if (match) return parseInt(match[1], 16);
  const chars = Array.from(trimmed);
  if (chars.length === 1) return trimmed.codePointAt(0);
  return null;
}

export function CharacterMapPanel() {
  const glyphSet = useStore((s) => s.glyphSet);
  const activeCodepoint = useStore((s) => s.activeCodepoint);
  const selectGlyph = useStore((s) => s.selectGlyph);
  const assignCodepoint = useStore((s) => s.assignCodepoint);
  const removeGlyphAction = useStore((s) => s.removeGlyphAction);
  const requestConfirm = useStore((s) => s.requestConfirm);
  const [hoveredCodepoint, setHoveredCodepoint] = useState(null);
  // A font commonly wants more than one preset at once (e.g. Basic Latin
  // *and* Card Suits), so this is a multi-select — the grid shows the
  // deduplicated union of every checked preset's codepoints, not just one.
  // Seeded from the wizard's initial preset choice; falls back to 'basic-latin'.
  const [presetIds, setPresetIds] = useState(() => {
    const initial = useStore.getState().initialCharsetPreset ?? 'basic-latin';
    return initial === 'none' ? new Set() : new Set([initial]);
  });
  const [input, setInput] = useState('');

  function togglePreset(id) {
    setPresetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const codepoints = useMemo(() => mergedPresetCodepoints(Array.from(presetIds)), [presetIds]);

  if (!glyphSet || glyphSet.kind !== 'characters') return null;

  async function assign(codepoint) {
    if (wouldCollide(glyphSet, codepoint) && !(await requestConfirm(`U+${codepoint.toString(16).toUpperCase()} already has a glyph — replace it?`))) {
      return;
    }
    assignCodepoint(codepoint);
    setInput('');
  }

  function handleSubmit(evt) {
    evt.preventDefault();
    const codepoint = parseCodepointInput(input);
    if (codepoint != null) assign(codepoint);
  }

  const parsedPreview = parseCodepointInput(input);
  const canCreate = parsedPreview != null && !glyphSet.glyphs.has(parsedPreview);

  return (
    <div className="panel">
      <strong>Character Map</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {CHARSET_PRESET_IDS.map((id) => (
          <label
            key={id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: presetIds.has(id) ? 'var(--chrome-accent-soft)' : 'var(--chrome-bg-raised)',
              border: presetIds.has(id) ? '1px solid var(--chrome-accent)' : '1px solid transparent',
              padding: '0.25rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={presetIds.has(id)} onChange={() => togglePreset(id)} />
            {CHARSET_PRESETS[id].label}
          </label>
        ))}
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 4 }}>
        <input placeholder="Type a character, or U+00E9" value={input} onChange={(e) => setInput(e.target.value)} style={{ flex: 1 }} />
        <button type="submit" disabled={!canCreate}>
          Create
        </button>
      </form>
      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--chrome-text-muted)' }}>
        Type a character or click a placeholder, then click Create to start drawing it.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 320, overflow: 'auto' }}>
        {codepoints.map((codepoint) => {
          const glyph = glyphSet.glyphs.get(codepoint);
          const isActive = activeCodepoint === codepoint;
          const isPendingCreate = !glyph && parsedPreview === codepoint;
          const cellStyle = isActive ? CELL_BORDER.active
            : glyph ? CELL_BORDER.hasGlyph
            : isPendingCreate ? CELL_BORDER.pendingCreate
            : CELL_BORDER.empty;
          const isHovered = hoveredCodepoint === codepoint;
          return (
            <div
              key={codepoint}
              className="cell"
              onClick={() => { setInput(String.fromCodePoint(codepoint)); if (glyph) selectGlyph(codepoint); }}
              onMouseEnter={() => setHoveredCodepoint(codepoint)}
              onMouseLeave={() => setHoveredCodepoint(null)}
              title={`${String.fromCodePoint(codepoint)} (U+${codepoint.toString(16).toUpperCase()})`}
              style={{
                position: 'relative',
                cursor: 'pointer',
                padding: 2,
                ...cellStyle,
              }}
            >
              <GlyphThumbnail glyph={glyph} codepoint={codepoint} />
              {glyph && isHovered && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (await requestConfirm(`Remove glyph for ${String.fromCodePoint(codepoint)} (U+${codepoint.toString(16).toUpperCase()})?`)) {
                      removeGlyphAction(codepoint);
                    }
                  }}
                  title="Remove glyph"
                  style={{
                    position: 'absolute', top: 1, right: 1,
                    width: 14, height: 14,
                    padding: 0, lineHeight: '14px', fontSize: 10,
                    background: 'var(--chrome-danger)', color: '#fff',
                    border: 'none', borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <CloseIcon size={9} />
                </button>
              )}
            </div>
          );
        })}
        {codepoints.length === 0 && (
          <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>No preset selected — check one or more above, or use GlyphSetPanel to browse already-assigned glyphs.</span>
        )}
      </div>
    </div>
  );
}
