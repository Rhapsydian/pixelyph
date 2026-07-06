// Draw mode only (glyphs never animate): a horizontal strip of per-frame
// thumbnails — click to make a frame active, plus add/duplicate/delete, a
// per-frame duration (ms) input, and a frame-rate control (the default
// duration new frames get, not a retroactive rescale) feeding the animated
// exports (animatedSvg.js/spriteSheet.js/animatedRaster.js). Onion skinning
// is a separate toggle here but rendered by SvgPixelEditor itself, since it
// needs to composite into the live editing surface, not just this strip.

import { useEffect, useState } from 'react';
import { useStore } from '../../state/store.js';
import { composeFrameBody } from '../../export/svg/composeLayersSvg.js';
import { IconButton } from '../IconButton.jsx';
import { useResizeDrag } from '../useResizeDrag.js';
import { PlayIcon, PauseIcon, PlusIcon, DuplicateIcon, TrashIcon } from '../icons.jsx';

const THUMBNAIL_SIZE = 48;
// Tall enough for the controls row + one full row of frame cards (thumbnail
// + index + duration input + action buttons) without triggering the panel's
// own internal scrollbar at the default single-frame state.
const MIN_HEIGHT = 230;

function FrameThumbnail({ canvas, frameIndex }) {
  const { body, defs } = composeFrameBody(canvas, frameIndex);
  const defsHtml = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return (
    <svg
      width={THUMBNAIL_SIZE}
      height={THUMBNAIL_SIZE}
      viewBox={`0 0 ${canvas.width} ${canvas.height}`}
      style={{ background: 'var(--chrome-bg-canvas-surround)', display: 'block' }}
    >
      {defsHtml && <g dangerouslySetInnerHTML={{ __html: defsHtml }} />}
      <g dangerouslySetInnerHTML={{ __html: body }} />
    </svg>
  );
}

function FrameCard({ canvas, frameIndex, isActive, isOnlyFrame }) {
  const setActiveFrame = useStore((s) => s.setActiveFrame);
  const duplicateFrame = useStore((s) => s.duplicateFrame);
  const removeFrame = useStore((s) => s.removeFrame);
  const setFrameDuration = useStore((s) => s.setFrameDuration);

  const committedDuration = canvas.frameDurations[frameIndex];
  const [duration, setDuration] = useState(committedDuration);
  // FrameCard is keyed by position (frameIndex), not a stable frame id — an
  // add/duplicate/remove elsewhere in the strip can shift which actual frame
  // a given position refers to without this component remounting, so local
  // state has to be resynced whenever the committed value for *this
  // position* changes, the same way GlyphSizeControl resyncs on
  // activeCodepoint/glyph.width changes in App.jsx.
  useEffect(() => {
    setDuration(committedDuration);
  }, [committedDuration]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div
        onClick={() => setActiveFrame(frameIndex)}
        className="cell"
        style={{
          border: isActive ? '2px solid var(--chrome-accent)' : '1px solid var(--chrome-border-strong)',
          cursor: 'pointer',
          lineHeight: 0,
        }}
      >
        <FrameThumbnail canvas={canvas} frameIndex={frameIndex} />
      </div>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--chrome-text-muted)' }}>{frameIndex + 1}</span>
      <label title="This frame's own duration, in milliseconds" style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'var(--text-xs)' }}>
        <input
          type="number"
          min={1}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          onBlur={() => duration !== committedDuration && setFrameDuration(frameIndex, duration)}
          style={{ width: 44 }}
        />
        ms
      </label>
      <span style={{ display: 'flex', gap: 2 }}>
        <IconButton icon={<DuplicateIcon />} label="Duplicate frame" onClick={() => duplicateFrame(frameIndex)} />
        <IconButton icon={<TrashIcon />} label="Delete frame" disabled={isOnlyFrame} onClick={() => removeFrame(frameIndex)} />
      </span>
    </div>
  );
}

export function FrameStrip() {
  const canvas = useStore((s) => s.canvas);
  const addFrame = useStore((s) => s.addFrame);
  const setFrameRate = useStore((s) => s.setFrameRate);
  const onionSkinEnabled = useStore((s) => s.onionSkinEnabled);
  const toggleOnionSkin = useStore((s) => s.toggleOnionSkin);
  const isPlaying = useStore((s) => s.isPlaying);
  const togglePlayback = useStore((s) => s.togglePlayback);
  const [height, onHandlePointerDown] = useResizeDrag({ initial: MIN_HEIGHT, min: MIN_HEIGHT, max: 480, axis: 'y', invert: true });

  return (
    <div className="canvas-region-stretch" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div className="resize-handle-row" onPointerDown={onHandlePointerDown} title="Drag to resize" />
      <div
        className="panel"
        style={{
          height,
          minHeight: MIN_HEIGHT,
          overflow: 'auto',
          minWidth: 0,
          background: 'var(--chrome-bg-panel)',
          border: '1px solid var(--chrome-border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'nowrap', flexShrink: 0 }}>
        <strong style={{ flexShrink: 0 }}>Frames</strong>
        <IconButton
          icon={isPlaying ? <PauseIcon /> : <PlayIcon />}
          label={isPlaying ? 'Pause' : 'Play'}
          active={isPlaying}
          disabled={canvas.frameCount <= 1}
          onClick={togglePlayback}
        />
        <IconButton icon={<PlusIcon />} label="Add frame" onClick={() => addFrame()} />
        <label title="The duration a newly-added frame gets — doesn't change existing frames' own durations" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
          Default FPS:{' '}
          <input
            type="number"
            min={1}
            max={60}
            value={canvas.frameRate}
            onChange={(e) => setFrameRate(Math.max(1, Math.min(60, Number(e.target.value))))}
            style={{ width: 48 }}
          />
        </label>
        <label title="Shows a faded, color-tinted preview of the adjacent frame(s) behind the current one" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
          <input type="checkbox" checked={onionSkinEnabled} onChange={toggleOnionSkin} /> Onion skin
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Array.from({ length: canvas.frameCount }, (_, frameIndex) => (
          <FrameCard
            key={frameIndex}
            canvas={canvas}
            frameIndex={frameIndex}
            isActive={frameIndex === canvas.activeFrame}
            isOnlyFrame={canvas.frameCount <= 1}
          />
        ))}
      </div>
      </div>
    </div>
  );
}
