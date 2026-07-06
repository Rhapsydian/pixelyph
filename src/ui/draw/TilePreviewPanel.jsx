// Checks seamless-pattern/texture work by re-embedding the same
// composeLayersSvg output multiple times in a 3x3 grid — no new
// rendering path, just the real export markup repeated.

import { useMemo } from 'react';
import { useStore } from '../../state/store.js';
import { composeLayersSvg } from '../../export/svg/composeLayersSvg.js';

export function TilePreviewPanel() {
  const canvas = useStore((s) => s.canvas);
  const svgMarkup = useMemo(() => composeLayersSvg(canvas), [canvas]);

  return (
    <div className="panel">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          width: 240,
          height: 240,
          background: '#fff',
        }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: svgMarkup }} />
        ))}
      </div>
    </div>
  );
}
