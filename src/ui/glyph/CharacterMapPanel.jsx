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

  function assign(codepoint) {
    if (wouldCollide(glyphSet, codepoint) && !window.confirm(`U+${codepoint.toString(16).toUpperCase()} already has a glyph — replace it?`)) {
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
  const inputGlyphExists = parsedPreview != null && glyphSet.glyphs.has(parsedPreview);
  const buttonLabel = inputGlyphExists ? 'Edit' : 'Create';

  return (
    <div style={{ padding: '0.5rem', background: '#1e1e1e', color: '#eee', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 }}>
      <strong>Character Map</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {CHARSET_PRESET_IDS.map((id) => (
          <label
            key={id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: presetIds.has(id) ? '#2d4a6b' : '#333',
              border: presetIds.has(id) ? '1px solid #4da3ff' : '1px solid transparent',
              padding: '0.25rem 0.5rem',
              borderRadius: 4,
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
        <button type="submit" disabled={parsedPreview == null}>
          {buttonLabel}
        </button>
      </form>
      <p style={{ margin: 0, fontSize: '0.8em', color: '#888' }}>
        Type a character or click a placeholder, then click Create to start drawing it.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 320, overflow: 'auto' }}>
        {codepoints.map((codepoint) => {
          const glyph = glyphSet.glyphs.get(codepoint);
          return (
            <div
              key={codepoint}
              onClick={() => (glyph ? selectGlyph(codepoint) : setInput(String.fromCodePoint(codepoint)))}
              title={`${String.fromCodePoint(codepoint)} (U+${codepoint.toString(16).toUpperCase()})`}
              style={{
                cursor: 'pointer',
                padding: 2,
                borderRadius: 4,
                border: activeCodepoint === codepoint ? '1px solid #4da3ff' : '1px solid transparent',
                background: activeCodepoint === codepoint ? '#2d4a6b' : 'transparent',
              }}
            >
              <GlyphThumbnail glyph={glyph} codepoint={codepoint} />
            </div>
          );
        })}
        {codepoints.length === 0 && (
          <span style={{ color: '#888', fontSize: '0.85em' }}>No preset selected — check one or more above, or use GlyphSetPanel to browse already-assigned glyphs.</span>
        )}
      </div>
    </div>
  );
}
