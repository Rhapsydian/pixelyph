// The single, unconditional glyph browser/editor entry point — every
// glyph, typed or auto-assigned, named or not, lives in one list here (no
// more character-kind/icon-kind split). Clicking a thumbnail makes that
// glyph active in GlyphGridEditor, the same "click an item in a side panel
// to make it the active editing target" interaction LayersPanel already
// uses in Draw mode. Only ever iterates real glyphSet.glyphs Map entries —
// no phantom/ghost cells for a codepoint that has no Glyph object yet.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../state/store.js';
import { isAutoAssignedCodepoint, isDisplayableChar, nonDisplayableLabel, isEmptyGlyph, wouldCollide } from '../../model/GlyphSet.js';
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

function hex(codepoint) {
  return `U+${codepoint.toString(16).toUpperCase()}`;
}

// Prefers the real character over the name, except for non-displayed
// characters (space, control chars, ...), where it falls back to name (or
// a hex/placeholder label if there's no name either).
function glyphLabel(codepoint, glyph) {
  if (!isAutoAssignedCodepoint(codepoint) && isDisplayableChar(codepoint)) {
    let char;
    try { char = String.fromCodePoint(codepoint); } catch { char = '?'; }
    return `${char} (${hex(codepoint)})`;
  }
  if (glyph.name) return glyph.name;
  if (!isAutoAssignedCodepoint(codepoint)) {
    const label = nonDisplayableLabel(codepoint);
    if (label) return `${label} (${hex(codepoint)})`;
  }
  return `(unnamed) (${hex(codepoint)})`;
}

// Drives both the caution badge and the selection alert — an
// auto-assigned codepoint, a missing name, or an empty grid all count,
// independently of each other.
function hasIssue(codepoint, glyph) {
  return isAutoAssignedCodepoint(codepoint) || !glyph.name || isEmptyGlyph(glyph);
}

export function GlyphSetPanel() {
  const glyphSet = useStore((s) => s.glyphSet);
  const activeCodepoint = useStore((s) => s.activeCodepoint);
  const selectGlyph = useStore((s) => s.selectGlyph);
  const removeGlyphAction = useStore((s) => s.removeGlyphAction);
  const requestConfirm = useStore((s) => s.requestConfirm);
  const addGlyph = useStore((s) => s.addGlyph);
  const reassignGlyphCodepoint = useStore((s) => s.reassignGlyphCodepoint);
  const updateGlyphMeta = useStore((s) => s.updateGlyphMeta);
  const setBulkAddModalOpen = useStore((s) => s.setBulkAddModalOpen);

  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState('codepoint'); // 'codepoint' | 'name'
  const [hoveredCodepoint, setHoveredCodepoint] = useState(null);

  const [editName, setEditName] = useState('');
  const [editCharacter, setEditCharacter] = useState('');
  const [editCharacterError, setEditCharacterError] = useState(false);

  useEffect(() => {
    if (activeCodepoint == null || !glyphSet) { setEditName(''); setEditCharacter(''); setEditCharacterError(false); return; }
    const g = glyphSet.glyphs.get(activeCodepoint);
    if (!g) return;
    setEditName(g.name ?? '');
    setEditCharacter(isAutoAssignedCodepoint(activeCodepoint) ? '' : isDisplayableChar(activeCodepoint) ? String.fromCodePoint(activeCodepoint) : hex(activeCodepoint));
    setEditCharacterError(false);
  }, [activeCodepoint]);

  const entries = useMemo(() => {
    if (!glyphSet) return [];
    const all = Array.from(glyphSet.glyphs.entries()).map(([codepoint, glyph]) => ({ codepoint, glyph }));
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter(({ codepoint, glyph }) => glyphLabel(codepoint, glyph).toLowerCase().includes(q) || codepoint.toString(16).toLowerCase().includes(q))
      : all;
    return sortMode === 'name'
      ? filtered.sort((a, b) => (a.glyph.name ?? '').localeCompare(b.glyph.name ?? '') || a.codepoint - b.codepoint)
      : filtered.sort((a, b) => a.codepoint - b.codepoint);
  }, [glyphSet, query, sortMode]);

  if (!glyphSet) return null;

  async function handleEditCharacterChange(text) {
    setEditCharacter(text);
    const parsed = parseUnicodeInput(text);
    if (parsed === undefined) { setEditCharacterError(true); return; }
    setEditCharacterError(false);
    if (parsed == null || parsed === activeCodepoint) return; // cleared, or unchanged — no reassignment to make
    if (wouldCollide(glyphSet, parsed)) {
      const existing = glyphSet.glyphs.get(parsed);
      if (!(await requestConfirm(`${glyphLabel(parsed, existing)} already has a glyph — replace it?`))) return;
    }
    reassignGlyphCodepoint(activeCodepoint, parsed);
  }

  const activeGlyph = activeCodepoint != null ? glyphSet.glyphs.get(activeCodepoint) : null;

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Glyphs ({glyphSet.glyphs.size})</strong>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => addGlyph()} title="Add glyph" style={{ width: 20, height: 20, padding: 0, lineHeight: '20px', fontSize: 'var(--text-xs)' }}>+</button>
          <div style={{ display: 'flex', border: '1px solid var(--chrome-border-strong)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <button
              onClick={() => setSortMode('codepoint')}
              style={{
                border: 'none', padding: '2px 6px', fontSize: 'var(--text-xs)',
                background: sortMode === 'codepoint' ? 'var(--chrome-accent-soft)' : 'transparent',
                color: sortMode === 'codepoint' ? 'var(--chrome-accent)' : 'var(--chrome-text-muted)',
              }}
            >
              Codepoint
            </button>
            <button
              onClick={() => setSortMode('name')}
              style={{
                border: 'none', borderLeft: '1px solid var(--chrome-border-strong)', padding: '2px 6px', fontSize: 'var(--text-xs)',
                background: sortMode === 'name' ? 'var(--chrome-accent-soft)' : 'transparent',
                color: sortMode === 'name' ? 'var(--chrome-accent)' : 'var(--chrome-text-muted)',
              }}
            >
              Name
            </button>
          </div>
        </div>
      </div>
      <input placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: '100%' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <input
          placeholder="Name"
          value={editName}
          disabled={!activeGlyph}
          onChange={(e) => {
            setEditName(e.target.value);
            updateGlyphMeta(activeCodepoint, { name: e.target.value });
          }}
        />
        <input
          placeholder="Character"
          title="Optional — paste a character, or type U+xxxx, &hearts;, or &#x2764;"
          value={editCharacter}
          disabled={!activeGlyph}
          onChange={(e) => handleEditCharacterChange(e.target.value)}
          style={{ borderColor: editCharacterError ? 'var(--chrome-danger)' : undefined }}
        />
        {editCharacterError && <span style={{ color: 'var(--chrome-danger)', fontSize: 'var(--text-xs)' }}>Not a recognized character, U+xxxx, HTML entity, or &#xNNNN;</span>}
      </div>
      {activeGlyph && hasIssue(activeCodepoint, activeGlyph) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--chrome-warning-soft, rgba(245,166,35,0.12))', border: '1px solid var(--chrome-warning)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 'var(--text-xs)', color: 'var(--chrome-warning)' }}>
          Glyph missing codepoint, name, or content.
        </div>
      )}
      <button onClick={() => setBulkAddModalOpen(true)} style={{ alignSelf: 'flex-start' }}>Bulk Add…</button>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 320, overflow: 'auto' }}>
        {entries.map(({ codepoint, glyph }) => (
          <div
            key={codepoint}
            className={activeCodepoint === codepoint ? 'cell active' : 'cell'}
            onClick={() => selectGlyph(codepoint)}
            onMouseEnter={() => setHoveredCodepoint(codepoint)}
            onMouseLeave={() => setHoveredCodepoint(null)}
            title={glyphLabel(codepoint, glyph)}
            style={{
              position: 'relative',
              cursor: 'pointer',
              padding: 2,
              border: activeCodepoint === codepoint ? '1px solid var(--chrome-accent)' : '1px solid var(--chrome-border-strong)',
            }}
          >
            <GlyphThumbnail glyph={glyph} codepoint={codepoint} />
            {hasIssue(codepoint, glyph) && (
              <div
                title="Missing codepoint, name, or content"
                style={{
                  position: 'absolute', top: -3, left: -3,
                  width: 9, height: 9, borderRadius: 2,
                  background: 'var(--chrome-warning)', border: '1.5px solid var(--chrome-bg-raised)',
                }}
              />
            )}
            {hoveredCodepoint === codepoint && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (await requestConfirm(`Remove glyph ${glyphLabel(codepoint, glyph)}?`)) {
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
    </div>
  );
}
