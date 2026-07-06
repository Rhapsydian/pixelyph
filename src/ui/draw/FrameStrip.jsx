// Draw mode only (glyphs never animate): a horizontal strip of per-frame
// thumbnails — click to make a frame active, plus add/duplicate/delete and
// a frame-rate control feeding the animated exports (animatedSvg.js/
// spriteSheet.js/animatedRaster.js). Onion skinning is a separate toggle
// here but rendered by SvgPixelEditor itself, since it needs to composite
// into the live editing surface, not just this strip.

import { useStore } from '../../state/store.js';
import { composeFrameBody } from '../../export/svg/composeLayersSvg.js';

const THUMBNAIL_SIZE = 48;

function FrameThumbnail({ canvas, frameIndex }) {
  const { body, defs } = composeFrameBody(canvas, frameIndex);
  const defsHtml = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return (
    <svg
      width={THUMBNAIL_SIZE}
      height={THUMBNAIL_SIZE}
      viewBox={`0 0 ${canvas.width} ${canvas.height}`}
      style={{ background: '#2a2a2a', display: 'block' }}
    >
      {defsHtml && <g dangerouslySetInnerHTML={{ __html: defsHtml }} />}
      <g dangerouslySetInnerHTML={{ __html: body }} />
    </svg>
  );
}

export function FrameStrip() {
  const canvas = useStore((s) => s.canvas);
  const setActiveFrame = useStore((s) => s.setActiveFrame);
  const addFrame = useStore((s) => s.addFrame);
  const duplicateFrame = useStore((s) => s.duplicateFrame);
  const removeFrame = useStore((s) => s.removeFrame);
  const setFrameRate = useStore((s) => s.setFrameRate);
  const onionSkinEnabled = useStore((s) => s.onionSkinEnabled);
  const toggleOnionSkin = useStore((s) => s.toggleOnionSkin);

  return (
    <div style={{ padding: '0.5rem', background: '#1e1e1e', color: '#eee', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <strong>Frames</strong>
        <button onClick={() => addFrame()}>+ Add Frame</button>
        <label>
          FPS:{' '}
          <input
            type="number"
            min={1}
            max={60}
            value={canvas.frameRate}
            onChange={(e) => setFrameRate(Math.max(1, Math.min(60, Number(e.target.value))))}
            style={{ width: 48 }}
          />
        </label>
        <label title="Shows a faded, color-tinted preview of the adjacent frame(s) behind the current one">
          <input type="checkbox" checked={onionSkinEnabled} onChange={toggleOnionSkin} /> Onion skin
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Array.from({ length: canvas.frameCount }, (_, frameIndex) => (
          <div key={frameIndex} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div
              onClick={() => setActiveFrame(frameIndex)}
              style={{
                border: frameIndex === canvas.activeFrame ? '2px solid #4da3ff' : '1px solid #444',
                borderRadius: 4,
                cursor: 'pointer',
                lineHeight: 0,
              }}
            >
              <FrameThumbnail canvas={canvas} frameIndex={frameIndex} />
            </div>
            <span style={{ fontSize: '0.75em', color: '#888' }}>{frameIndex + 1}</span>
            <span style={{ display: 'flex', gap: 2 }}>
              <button onClick={() => duplicateFrame(frameIndex)} title="Duplicate frame">
                ⧉
              </button>
              <button onClick={() => removeFrame(frameIndex)} disabled={canvas.frameCount <= 1} title="Delete frame">
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
