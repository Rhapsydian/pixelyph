// Character-kind sets only (see GlyphSetPanel for the shared thumbnail
// browser both kinds use, and for icon-kind's separate "add by name" flow).
// One cell per codepoint in the chosen preset, showing an existing glyph's
// thumbnail or an empty placeholder — progress through a charset visible at
// a glance. Assignment is direct: type the character itself, or U+00E9 for
// anything awkward to type, into the input below; either creates the glyph
// (if new) and opens it. Reusing an already-assigned codepoint prompts to
// confirm replacing it (GlyphSet.wouldCollide), the same confirm-before-
// destructive pattern as Draw mode's tier toggle.

import { useMemo, useState } from 'react';
import { useStore } from '../../state/store.js';
import { CHARSET_PRESETS, CHARSET_PRESET_IDS, presetCodepoints } from '../../model/charsetPresets.js';
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
  const [presetId, setPresetId] = useState('basic-latin');
  const [input, setInput] = useState('');

  const codepoints = useMemo(() => (presetId === 'custom' ? [] : presetCodepoints(presetId)), [presetId]);

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

  return (
    <div style={{ padding: '0.5rem', background: '#1e1e1e', color: '#eee', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 }}>
      <strong>Character Map</strong>
      <label>
        Preset:{' '}
        <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
          {CHARSET_PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {CHARSET_PRESETS[id].label}
            </option>
          ))}
          <option value="custom">Custom (already-assigned only)</option>
        </select>
      </label>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 4 }}>
        <input placeholder="Type a character, or U+00E9" value={input} onChange={(e) => setInput(e.target.value)} style={{ flex: 1 }} />
        <button type="submit" disabled={parsedPreview == null}>
          Assign
        </button>
      </form>
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
              <GlyphThumbnail glyph={glyph} />
            </div>
          );
        })}
        {codepoints.length === 0 && presetId === 'custom' && <span style={{ color: '#888', fontSize: '0.85em' }}>Custom preset shows nothing here — use GlyphSetPanel to browse already-assigned glyphs.</span>}
      </div>
    </div>
  );
}
