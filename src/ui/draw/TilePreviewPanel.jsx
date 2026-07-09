// Checks seamless-pattern/texture work by re-embedding the same
// composeLayersSvg output multiple times in a resizable grid — no new
// rendering path, just the real export markup repeated.

import { useMemo, useState } from 'react';
import { useStore } from '../../state/store.js';
import { composeLayersSvg } from '../../export/svg/composeLayersSvg.js';

const REPEAT_OPTIONS = [2, 3, 4, 5, 6];
// Same valid-CSS checkerboard trick as ColorAlphaInput.jsx's swatch backdrop
// (a unitless/invalid version of this silently drops the whole background-image
// declaration in some browsers — see BACKLOG.md/session notes) tiled smaller so
// it reads as "transparency," not a checkers board pattern of its own.
const CHECKER_BACKGROUND = {
  backgroundImage: 'conic-gradient(#3a3a3a 90deg, #2a2a2a 90deg 180deg, #3a3a3a 180deg 270deg, #2a2a2a 270deg)',
  backgroundSize: '16px 16px',
};
const BACKGROUNDS = {
  checker: CHECKER_BACKGROUND,
  white: { background: '#ffffff' },
  black: { background: '#000000' },
};

export function TilePreviewPanel() {
  const canvas = useStore((s) => s.canvas);
  const svgMarkup = useMemo(() => composeLayersSvg(canvas), [canvas]);
  const [repeat, setRepeat] = useState(3);
  const [bg, setBg] = useState(/** @type {'checker'|'white'|'black'} */ ('checker'));

  return (
    <div className="panel">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          Repeat:
          <select value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
            {REPEAT_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}×{n}</option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.keys(BACKGROUNDS).map((key) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="radio" checked={bg === key} onChange={() => setBg(key)} />
              {key[0].toUpperCase() + key.slice(1)}
            </label>
          ))}
        </div>
      </div>

      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          display: 'grid',
          gridTemplateColumns: `repeat(${repeat}, 1fr)`,
          gridTemplateRows: `repeat(${repeat}, 1fr)`,
          ...BACKGROUNDS[bg],
        }}
      >
        {Array.from({ length: repeat * repeat }, (_, i) => (
          <div key={i} className="tile-preview-cell" style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: svgMarkup }} />
        ))}
      </div>
    </div>
  );
}
