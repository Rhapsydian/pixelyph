// Minimap-style viewport preview, docked above the side panel's tabs so
// it's visible regardless of which tab is active. Replaces native
// scrollbars on the canvas viewport (SvgPixelEditor now disables them
// entirely, see canvas-editor-area/pan in theme.css and
// SvgPixelEditor.jsx) — when the zoomed canvas is larger than what's
// visible, this draws a proportional rectangle over a small full-canvas
// thumbnail that can be dragged to pan. Also hosts the zoom slider, moved
// here from ContextBar since it's the same "how much of the canvas am I
// looking at" concern as the minimap itself.

import { useRef } from 'react';
import { useStore } from '../state/store.js';
import { composeLayersBody } from '../export/svg/composeLayersSvg.js';

export function ViewportPreview() {
  const mode = useStore((s) => s.mode);
  const canvas = useStore((s) => s.canvas);
  const glyphCanvas = useStore((s) => s.glyphCanvas);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const pan = useStore((s) => s.pan);
  const setPan = useStore((s) => s.setPan);
  const viewportSize = useStore((s) => s.viewportSize);
  const doc = mode === 'glyph' ? glyphCanvas : canvas;

  const boxRef = useRef(null);

  const zoomControl = (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      Zoom:{' '}
      <input type="range" min={1} max={48} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ flex: 1 }} />
      <span style={{ minWidth: 32, textAlign: 'right' }}>{zoom}x</span>
    </label>
  );

  if (!doc) {
    return <div className="panel" style={{ borderBottom: '1px solid var(--chrome-border)' }}>{zoomControl}</div>;
  }

  const { body, defs } = composeLayersBody(doc);
  const defsHtml = defs.length ? `<defs>${defs.join('')}</defs>` : '';

  const pixelWidth = doc.width * zoom;
  const pixelHeight = doc.height * zoom;
  const maxPanX = Math.max(0, pixelWidth - viewportSize.width);
  const maxPanY = Math.max(0, pixelHeight - viewportSize.height);
  const hasOverflow = maxPanX > 0 || maxPanY > 0;
  const clampedPanX = Math.max(0, Math.min(maxPanX, pan.x));
  const clampedPanY = Math.max(0, Math.min(maxPanY, pan.y));

  const rectWidthPct = Math.min(100, (viewportSize.width / pixelWidth) * 100);
  const rectHeightPct = Math.min(100, (viewportSize.height / pixelHeight) * 100);
  const rectLeftPct = (clampedPanX / pixelWidth) * 100;
  const rectTopPct = (clampedPanY / pixelHeight) * 100;

  function onRectPointerDown(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    const boxRect = boxRef.current.getBoundingClientRect();
    const start = { x: evt.clientX, y: evt.clientY, panX: clampedPanX, panY: clampedPanY };

    function onMove(moveEvt) {
      const dxContent = ((moveEvt.clientX - start.x) / boxRect.width) * pixelWidth;
      const dyContent = ((moveEvt.clientY - start.y) / boxRect.height) * pixelHeight;
      setPan({
        x: Math.max(0, Math.min(maxPanX, start.panX + dxContent)),
        y: Math.max(0, Math.min(maxPanY, start.panY + dyContent)),
      });
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div className="panel" style={{ borderBottom: '1px solid var(--chrome-border)' }}>
      <div
        ref={boxRef}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: `${doc.width} / ${doc.height}`,
          maxHeight: 160,
          margin: '0 auto',
          background: 'var(--chrome-bg-canvas-surround)',
          border: '1px solid var(--chrome-border)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}
      >
        <svg width="100%" height="100%" viewBox={`0 0 ${doc.width} ${doc.height}`} style={{ display: 'block' }}>
          {defsHtml && <g dangerouslySetInnerHTML={{ __html: defsHtml }} />}
          <g dangerouslySetInnerHTML={{ __html: body }} />
        </svg>
        {hasOverflow && (
          <div
            onPointerDown={onRectPointerDown}
            title="Drag to pan"
            style={{
              position: 'absolute',
              left: `${rectLeftPct}%`,
              top: `${rectTopPct}%`,
              width: `${rectWidthPct}%`,
              height: `${rectHeightPct}%`,
              border: '1px solid var(--chrome-accent)',
              background: 'rgba(77, 163, 255, 0.2)',
              cursor: 'move',
            }}
          />
        )}
      </div>
      {zoomControl}
    </div>
  );
}
