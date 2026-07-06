// A tiny, exact preview of a Fill value (solid/gradient/pattern/none),
// independent of any layer or canvas — just `serializeFill`
// (export/svg/layerStyle.js) rendering a <rect> + its own <defs> into a
// small <svg>. Reused wherever a fill needs previewing on its own terms:
// the gradient/pattern editor's live preview in LayerStylePanel.jsx (the
// point being it shows the fill itself, not "whatever's currently applied
// to the layer"), the Palette panel's Gradients & Patterns swatches, and
// the fill portion of a saved Style swatch. One small implementation
// instead of a separate CSS-approximated gradient preview plus an exact
// one for patterns (CSS alone can't render arbitrary pasted SVG content).

import { useId } from 'react';
import { serializeFill } from '../export/svg/layerStyle.js';

export function FillSwatch({ fill, size = 20, title }) {
  const defId = `fillswatch-${useId().replace(/:/g, '')}`;
  const { attr, def } = serializeFill(fill, defId);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1 1"
      style={{ background: 'var(--chrome-bg-raised)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius-sm)', flexShrink: 0, display: 'block' }}
    >
      {title && <title>{title}</title>}
      {def && <defs dangerouslySetInnerHTML={{ __html: def }} />}
      <rect width="1" height="1" fill={attr} />
    </svg>
  );
}
