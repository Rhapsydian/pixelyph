// Shared thumbnail browser for both GlyphSet kinds — sorted by codepoint
// (character sets) or alphabetically by name (icon sets), with a search
// box. Clicking a thumbnail makes that glyph active in GlyphGridEditor, the
// same "click an item in a side panel to make it the active editing
// target" interaction LayersPanel already uses in Draw mode. Icon-kind sets
// have no character map (CharacterMapPanel), so their "add a new glyph"
// affordance — name in, next PUA codepoint derived automatically — lives
// here instead.

import { useMemo, useState } from 'react';
import { useStore } from '../../state/store.js';
import { GlyphThumbnail } from './GlyphThumbnail.jsx';

function glyphLabel(codepoint, glyph, kind) {
  if (kind === 'icons') return glyph.name || '(unnamed)';
  let char;
  try {
    char = String.fromCodePoint(codepoint);
  } catch {
    char = '?';
  }
  return `${char} (U+${codepoint.toString(16).toUpperCase()})`;
}

export function GlyphSetPanel() {
  const glyphSet = useStore((s) => s.glyphSet);
  const activeCodepoint = useStore((s) => s.activeCodepoint);
  const selectGlyph = useStore((s) => s.selectGlyph);
  const removeGlyphAction = useStore((s) => s.removeGlyphAction);
  const addIconGlyph = useStore((s) => s.addIconGlyph);
  const [query, setQuery] = useState('');
  const [newIconName, setNewIconName] = useState('');

  const entries = useMemo(() => {
    if (!glyphSet) return [];
    const all = Array.from(glyphSet.glyphs.entries()).map(([codepoint, glyph]) => ({ codepoint, glyph }));
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter(({ codepoint, glyph }) => glyphLabel(codepoint, glyph, glyphSet.kind).toLowerCase().includes(q) || codepoint.toString(16).toLowerCase().includes(q))
      : all;
    return glyphSet.kind === 'icons'
      ? filtered.sort((a, b) => (a.glyph.name ?? '').localeCompare(b.glyph.name ?? ''))
      : filtered.sort((a, b) => a.codepoint - b.codepoint);
  }, [glyphSet, query]);

  if (!glyphSet) return null;

  return (
    <div style={{ padding: '0.5rem', background: '#1e1e1e', color: '#eee', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 }}>
      <strong>
        Glyphs ({glyphSet.glyphs.size}) — {glyphSet.kind}
      </strong>
      <input placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: '100%' }} />
      {glyphSet.kind === 'icons' && (
        <div style={{ display: 'flex', gap: 4 }}>
          <input placeholder="New icon name" value={newIconName} onChange={(e) => setNewIconName(e.target.value)} style={{ flex: 1 }} />
          <button
            disabled={!newIconName.trim()}
            onClick={() => {
              addIconGlyph(newIconName.trim());
              setNewIconName('');
            }}
          >
            + Add Icon
          </button>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 320, overflow: 'auto' }}>
        {entries.map(({ codepoint, glyph }) => (
          <div
            key={codepoint}
            onClick={() => selectGlyph(codepoint)}
            title={glyphLabel(codepoint, glyph, glyphSet.kind)}
            style={{
              position: 'relative',
              cursor: 'pointer',
              padding: 2,
              borderRadius: 4,
              border: activeCodepoint === codepoint ? '1px solid #4da3ff' : '1px solid transparent',
              background: activeCodepoint === codepoint ? '#2d4a6b' : 'transparent',
            }}
          >
            <GlyphThumbnail glyph={glyph} />
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeGlyphAction(codepoint);
              }}
              title="Delete glyph"
              style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, lineHeight: '12px', padding: 0, fontSize: 10 }}
            >
              &times;
            </button>
          </div>
        ))}
        {entries.length === 0 && <span style={{ color: '#888', fontSize: '0.85em' }}>No glyphs yet.</span>}
      </div>
    </div>
  );
}
