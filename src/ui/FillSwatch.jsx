// A tiny, exact preview of a Fill value (solid/gradient/none), independent
// of any layer or canvas — just `serializeFill` (export/svg/layerStyle.js)
// rendering a <rect> + its own <defs> into a small <svg>. Reused wherever a
// fill needs previewing on its own terms: the gradient editor's live
// preview (GradientEditorModal.jsx), the Palette panel's Gradients
// swatches, and the fill portion of a saved Style swatch.

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
      style={{ background: 'var(--chrome-bg-raised)', border: '1px solid var(--chrome-border)', borderRadius: 0, flexShrink: 0, display: 'block' }}
    >
      {title && <title>{title}</title>}
      {def && <defs dangerouslySetInnerHTML={{ __html: def }} />}
      <rect width="1" height="1" fill={attr} />
    </svg>
  );
}
