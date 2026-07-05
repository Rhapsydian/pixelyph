// A glyph is just a single unstyled grid, so this reuses SvgPixelEditor
// verbatim rather than building a separate pixel-painting implementation —
// SvgPixelEditor itself is mode-aware (see its getActiveDocument helper)
// and renders the active glyph, re-wrapped as a single-color pseudo-Canvas,
// whenever `mode === 'glyph'`. "Layers/style/effects turned off" falls out
// for free from that pseudo-Canvas only ever having at most one plain black
// auto-layer — no LayersPanel/LayerStylePanel ever apply here.

import { SvgPixelEditor } from '../draw/SvgPixelEditor.jsx';

export function GlyphGridEditor() {
  return <SvgPixelEditor />;
}
