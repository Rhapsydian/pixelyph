// Single "Export…" entry point (File menu, both modes) replacing the old
// standalone Export top-level menu — a menu can't host a raster-scale
// dropdown or an active-frame-vs-whole-animation choice without feeling like
// a form crammed into a list, so those settings get an actual modal instead.
// Mode-aware: Draw mode gets the format/scope/scale form below; Glyph mode
// reuses FontExportPanel unmodified (its own checkboxes/Export button are
// already a self-contained form) alongside a small "export just this one
// glyph as SVG" action that used to be the *only* thing the old Export menu
// offered in Glyph mode.

import { useState } from 'react';
import { useStore } from '../state/store.js';
import { Modal } from './Modal.jsx';
import { FontExportPanel } from './glyph/FontExportPanel.jsx';

const RASTER_SCALES = [1, 4, 8, 16];

function DrawExportForm({ onClose }) {
  const frameCount = useStore((s) => s.canvas.frameCount);
  const exportSvg = useStore((s) => s.exportSvg);
  const exportRaster = useStore((s) => s.exportRaster);
  const exportAnimatedSvg = useStore((s) => s.exportAnimatedSvg);
  const exportSpriteSheet = useStore((s) => s.exportSpriteSheet);
  const exportAnimatedGif = useStore((s) => s.exportAnimatedGif);

  const isAnimated = frameCount > 1;
  const [format, setFormat] = useState(/** @type {'svg'|'png'|'webp'|'gif'} */ ('svg'));
  const [scope, setScope] = useState(/** @type {'active'|'animation'} */ ('active'));
  const [scale, setScale] = useState(4);
  const [exporting, setExporting] = useState(false);

  // Only SVG and PNG have a real "whole animation" counterpart (animated
  // SVG, sprite sheet) — WebP has no animated export path, and GIF *is*
  // the animated export, so neither format needs the question at all.
  const supportsScope = isAnimated && (format === 'svg' || format === 'png');
  const isRaster = format !== 'svg';

  async function handleExport() {
    setExporting(true);
    try {
      if (format === 'svg') {
        if (supportsScope && scope === 'animation') await exportAnimatedSvg();
        else await exportSvg();
      } else if (format === 'png') {
        if (supportsScope && scope === 'animation') await exportSpriteSheet(scale);
        else await exportRaster('png', scale);
      } else if (format === 'webp') {
        await exportRaster('webp', scale);
      } else if (format === 'gif') {
        await exportAnimatedGif(scale);
      }
      onClose();
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 280 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        Format
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="svg">SVG</option>
          <option value="png">PNG</option>
          <option value="webp">WebP</option>
          {isAnimated && <option value="gif">Animated GIF</option>}
        </select>
      </label>

      {supportsScope && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Frames
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="active">Active frame only</option>
            <option value="animation">Whole animation ({format === 'svg' ? 'animated SVG' : 'sprite sheet'})</option>
          </select>
        </label>
      )}

      {isRaster && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Raster scale
          <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            {RASTER_SCALES.map((s) => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>
        </label>
      )}

      <button className="btn btn-primary" onClick={handleExport} disabled={exporting} style={{ alignSelf: 'flex-end' }}>
        {exporting ? 'Exporting…' : 'Export'}
      </button>
    </div>
  );
}

function GlyphExportForm() {
  const activeCodepoint = useStore((s) => s.activeCodepoint);
  const exportGlyphSvg = useStore((s) => s.exportGlyphSvg);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 300 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <strong>Active Glyph</strong>
        <button className="btn" onClick={exportGlyphSvg} disabled={activeCodepoint == null} style={{ alignSelf: 'flex-start' }}>
          Export Active Glyph SVG
        </button>
      </div>
      <div style={{ borderTop: '1px solid var(--chrome-border)' }} />
      <FontExportPanel />
    </div>
  );
}

export function ExportModal() {
  const open = useStore((s) => s.exportModalOpen);
  const setOpen = useStore((s) => s.setExportModalOpen);
  const mode = useStore((s) => s.mode);

  if (!open) return null;

  return (
    <Modal title="Export" onClose={() => setOpen(false)}>
      {mode === 'glyph' ? <GlyphExportForm /> : <DrawExportForm onClose={() => setOpen(false)} />}
    </Modal>
  );
}
