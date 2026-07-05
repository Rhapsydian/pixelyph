// Live specimen preview for both GlyphSet kinds — no font compile exists
// yet (that's Phase 4's compileFont.js/demoHtml.js), so this renders
// directly from each glyph's grid via pixelloom's gridToPath, the same
// tracing GlyphThumbnail uses. Character sets get a live text-entry
// preview; icon sets get clickable swatches that insert into the same
// preview row, so icons can be spot-checked without typing raw PUA escapes.

import { useState } from 'react';
import { useStore } from '../../state/store.js';
import { gridToPath } from 'pixelloom';

const PREVIEW_HEIGHT = 48;

function PreviewGlyph({ glyph, height }) {
  const scale = height / glyph.height;
  const width = glyph.width * scale;
  const d = gridToPath(glyph.pixels, glyph.width, glyph.height);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${glyph.width} ${glyph.height}`} style={{ display: 'block', flexShrink: 0 }}>
      {d && <path d={d} fill="#eee" fillRule="evenodd" />}
    </svg>
  );
}

export function SpecimenPreviewPanel() {
  const glyphSet = useStore((s) => s.glyphSet);
  const [text, setText] = useState('');

  if (!glyphSet) return null;

  return (
    <div style={{ padding: '0.5rem', background: '#1e1e1e', color: '#eee', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 320 }}>
      <strong>Specimen Preview</strong>
      {glyphSet.kind === 'characters' ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a sample string..." rows={2} style={{ width: '100%', resize: 'vertical' }} />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {Array.from(glyphSet.glyphs.entries())
            .sort((a, b) => (a[1].name ?? '').localeCompare(b[1].name ?? ''))
            .map(([codepoint, glyph]) => (
              <button
                key={codepoint}
                title={glyph.name}
                onClick={() => setText((t) => t + String.fromCodePoint(codepoint))}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 4 }}
              >
                <PreviewGlyph glyph={glyph} height={24} />
                <span style={{ fontSize: 9 }}>{glyph.name}</span>
              </button>
            ))}
          {glyphSet.glyphs.size === 0 && <span style={{ color: '#888', fontSize: '0.85em' }}>No icons yet.</span>}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, minHeight: PREVIEW_HEIGHT + 8, padding: 4, background: '#111', border: '1px solid #333', overflowX: 'auto' }}>
        {text.length === 0 && <span style={{ color: '#555' }}>Preview will appear here.</span>}
        {Array.from(text).map((char, i) => {
          const glyph = glyphSet.glyphs.get(char.codePointAt(0));
          return glyph ? (
            <PreviewGlyph key={i} glyph={glyph} height={PREVIEW_HEIGHT} />
          ) : (
            <span key={i} style={{ color: '#555', width: PREVIEW_HEIGHT / 2, textAlign: 'center' }}>
              {char === ' ' ? ' ' : '?'}
            </span>
          );
        })}
      </div>
    </div>
  );
}
