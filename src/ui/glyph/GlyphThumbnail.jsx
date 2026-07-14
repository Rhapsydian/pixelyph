// Renders a glyph's thumbnail via pixelloom's own gridToPath — the same
// tracing pixelloom already does for export, reused here rather than a
// separate thumbnail renderer (per the plan's GlyphSetPanel note). Plain
// JSX rather than dangerouslySetInnerHTML since a single glyph has no
// per-layer defs/gradients to inject, unlike SvgPixelEditor's composed body.
//
// No "phantom slot" rendering anymore — GlyphSetPanel only ever iterates
// real glyphSet.glyphs Map entries, so this is never called with a
// codepoint but no glyph. `codepoint` is still accepted, now purely to
// drive the empty-glyph watermark below.

import { gridToPath } from 'pixelloom';
import { isAutoAssignedCodepoint, isDisplayableChar, isEmptyGlyph } from '../../model/GlyphSet.js';

const DEFAULT_SIZE = 32;

export function GlyphThumbnail({ glyph, codepoint, size = DEFAULT_SIZE }) {
  const d = gridToPath(glyph.pixels, glyph.width, glyph.height);

  // Low-opacity backdrop of the glyph's own real character, shown only
  // while its grid is still blank — a visual cue for "this codepoint is
  // assigned, go draw it" that disappears once real pixels exist. No
  // watermark for auto-assigned/nameless codepoints (nothing meaningful to
  // render) or non-displayable ones (space, control chars, ...).
  let watermarkChar = null;
  if (codepoint != null && !isAutoAssignedCodepoint(codepoint) && isDisplayableChar(codepoint) && isEmptyGlyph(glyph)) {
    try { watermarkChar = String.fromCodePoint(codepoint); } catch { /* skip unrepresentable codepoints */ }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${glyph.width} ${glyph.height}`}
      style={{ background: 'var(--chrome-bg-raised)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius-sm)', flexShrink: 0, display: 'block' }}
    >
      {watermarkChar && (
        <text
          x={glyph.width / 2}
          y={glyph.height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={glyph.height * 0.7}
          fontFamily="var(--font-sans)"
          fill="var(--chrome-text-faint)"
          opacity={0.4}
        >
          {watermarkChar}
        </text>
      )}
      {d && <path d={d} fill="var(--chrome-text)" fillRule="evenodd" />}
    </svg>
  );
}
