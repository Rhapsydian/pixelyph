// Shared thumbnail browser for both GlyphSet kinds — sorted by codepoint
// (character sets) or alphabetically by name (icon sets), with a search
// box. Clicking a thumbnail makes that glyph active in GlyphGridEditor, the
// same "click an item in a side panel to make it the active editing
// target" interaction LayersPanel already uses in Draw mode. Icon-kind sets
// have no character map (CharacterMapPanel), so their "add a new glyph"
// affordance — name in, next PUA codepoint derived automatically — lives
// here instead.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../state/store.js';
import { GlyphThumbnail } from './GlyphThumbnail.jsx';
import { CloseIcon } from '../icons.jsx';

// Returns null (clear), a codepoint number (valid), or undefined (invalid).
// Accepts: single character, U+xxxx, &#x1F600;, &#9829;, &hearts;
function parseUnicodeInput(text) {
  const t = text.trim();
  if (!t) return null;
  const uPlus = /^u\+([0-9a-f]{1,6})$/i.exec(t);
  if (uPlus) return parseInt(uPlus[1], 16);
  const numHex = /^&#x([0-9a-f]+);?$/i.exec(t);
  if (numHex) return parseInt(numHex[1], 16);
  const numDec = /^&#([0-9]+);?$/.exec(t);
  if (numDec) return parseInt(numDec[1], 10);
  if (/^&[a-z][a-z0-9]*;$/i.test(t)) {
    const el = document.createElement('textarea');
    el.innerHTML = t;
    const decoded = el.value;
    if (decoded && decoded !== t) return decoded.codePointAt(0);
    return undefined;
  }
  const chars = [...t];
  if (chars.length === 1) return t.codePointAt(0);
  return undefined;
}

function unicodeDisplay(cp) {
  if (cp == null) return null;
  try { return `${String.fromCodePoint(cp)} (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`; }
  catch { return null; }
}

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
  const requestConfirm = useStore((s) => s.requestConfirm);
  const addIconGlyph = useStore((s) => s.addIconGlyph);
  const updateGlyphMeta = useStore((s) => s.updateGlyphMeta);
  const [query, setQuery] = useState('');
  const [newIconName, setNewIconName] = useState('');
  const [newIconUnicode, setNewIconUnicode] = useState('');
  const [newIconUnicodeError, setNewIconUnicodeError] = useState(false);
  const [hoveredCodepoint, setHoveredCodepoint] = useState(null);
  const [editName, setEditName] = useState('');
  const [editUnicode, setEditUnicode] = useState('');
  const [editUnicodeError, setEditUnicodeError] = useState(false);

  useEffect(() => {
    if (activeCodepoint == null || !glyphSet) { setEditName(''); setEditUnicode(''); setEditUnicodeError(false); return; }
    const g = glyphSet.glyphs.get(activeCodepoint);
    if (!g) return;
    setEditName(g.name ?? '');
    setEditUnicode(g.unicode != null ? String.fromCodePoint(g.unicode) : '');
    setEditUnicodeError(false);
  }, [activeCodepoint]);

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
    <div className="panel">
      <strong>
        Glyphs ({glyphSet.glyphs.size}) — {glyphSet.kind}
      </strong>
      <input placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: '100%' }} />
      {glyphSet.kind === 'icons' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              placeholder="Icon name"
              value={newIconName}
              onChange={(e) => setNewIconName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              disabled={!newIconName.trim()}
              onClick={() => {
                const parsed = parseUnicodeInput(newIconUnicode);
                addIconGlyph({ name: newIconName.trim(), unicode: parsed ?? null });
                setNewIconName('');
                setNewIconUnicode('');
                setNewIconUnicodeError(false);
              }}
            >
              + Add Icon
            </button>
          </div>
          <input
            placeholder="Unicode character (optional) — paste ❤, U+2764, &hearts;, &#x2764;"
            value={newIconUnicode}
            onChange={(e) => {
              setNewIconUnicode(e.target.value);
              setNewIconUnicodeError(e.target.value.trim() !== '' && parseUnicodeInput(e.target.value) === undefined);
            }}
            style={{ borderColor: newIconUnicodeError ? 'var(--chrome-danger)' : undefined }}
          />
          {newIconUnicodeError && <span style={{ color: 'var(--chrome-danger)', fontSize: 'var(--text-xs)' }}>Not a recognized character, U+xxxx, HTML entity, or &#xNNNN;</span>}
          {!newIconUnicodeError && (() => { const p = parseUnicodeInput(newIconUnicode); return p != null ? <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>{unicodeDisplay(p)}</span> : null; })()}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 320, overflow: 'auto' }}>
        {entries.map(({ codepoint, glyph }) => (
          <div
            key={codepoint}
            className={activeCodepoint === codepoint ? 'cell active' : 'cell'}
            onClick={() => selectGlyph(codepoint)}
            onMouseEnter={() => setHoveredCodepoint(codepoint)}
            onMouseLeave={() => setHoveredCodepoint(null)}
            title={glyphLabel(codepoint, glyph, glyphSet.kind)}
            style={{
              position: 'relative',
              cursor: 'pointer',
              padding: 2,
              border: activeCodepoint === codepoint ? '1px solid var(--chrome-accent)' : '1px solid var(--chrome-border-strong)',
            }}
          >
            <GlyphThumbnail glyph={glyph} codepoint={codepoint} />
            {hoveredCodepoint === codepoint && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (await requestConfirm(`Remove glyph ${glyphLabel(codepoint, glyph, glyphSet.kind)}?`)) {
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
        ))}
        {entries.length === 0 && <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>No glyphs yet.</span>}
      </div>
      {glyphSet.kind === 'icons' && activeCodepoint != null && glyphSet.glyphs.has(activeCodepoint) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--chrome-border)', paddingTop: 6 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--chrome-text-muted)' }}>Edit selected icon</span>
          <input
            placeholder="Icon name"
            value={editName}
            onChange={(e) => {
              setEditName(e.target.value);
              updateGlyphMeta(activeCodepoint, { name: e.target.value });
            }}
          />
          <input
            placeholder="Unicode character (optional) — paste ❤, U+2764, &hearts;, &#x2764;"
            value={editUnicode}
            onChange={(e) => {
              setEditUnicode(e.target.value);
              const parsed = parseUnicodeInput(e.target.value);
              if (parsed === undefined) { setEditUnicodeError(true); return; }
              setEditUnicodeError(false);
              updateGlyphMeta(activeCodepoint, { unicode: parsed });
            }}
            style={{ borderColor: editUnicodeError ? 'var(--chrome-danger)' : undefined }}
          />
          {editUnicodeError && <span style={{ color: 'var(--chrome-danger)', fontSize: 'var(--text-xs)' }}>Not a recognized character, U+xxxx, HTML entity, or &#xNNNN;</span>}
          {!editUnicodeError && (() => { const p = parseUnicodeInput(editUnicode); return p != null ? <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-xs)' }}>{unicodeDisplay(p)}</span> : null; })()}
        </div>
      )}
    </div>
  );
}
