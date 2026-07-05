// Renders a glyph's thumbnail via pixelloom's own gridToPath — the same
// tracing pixelloom already does for export, reused here rather than a
// separate thumbnail renderer (per the plan's GlyphSetPanel note). Plain
// JSX rather than dangerouslySetInnerHTML since a single glyph has no
// per-layer defs/gradients to inject, unlike SvgPixelEditor's composed body.

import { gridToPath } from 'pixelloom';

const DEFAULT_SIZE = 32;

export function GlyphThumbnail({ glyph, size = DEFAULT_SIZE, codepoint }) {
  if (!glyph) {
    let char = null;
    if (codepoint != null) {
      try { char = String.fromCodePoint(codepoint); } catch { /* skip unrepresentable codepoints */ }
    }
    return (
      <div style={{
        width: size, height: size,
        border: '1px dashed #555', borderRadius: 2, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#666', fontSize: Math.floor(size * 0.6), fontFamily: 'sans-serif',
        userSelect: 'none', overflow: 'hidden',
      }}>
        {char}
      </div>
    );
  }
  const d = gridToPath(glyph.pixels, glyph.width, glyph.height);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${glyph.width} ${glyph.height}`}
      style={{ background: '#242424', border: '1px solid #333', borderRadius: 2, flexShrink: 0, display: 'block' }}
    >
      {d && <path d={d} fill="#eee" fillRule="evenodd" />}
    </svg>
  );
}
