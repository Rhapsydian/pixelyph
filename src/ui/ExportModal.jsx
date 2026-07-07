// Single "Export…" entry point (File menu, both modes) replacing the old
// standalone Export top-level menu — a menu can't host a raster-scale
// dropdown or an active-frame-vs-whole-animation choice without feeling like
// a form crammed into a list, so those settings get an actual modal instead.
// Mode-aware: Draw mode gets the checkbox form below (mirroring Glyph mode's
// FontExportPanel: check several boxes, get one .zip if more than one file
// results); Glyph mode reuses FontExportPanel unmodified alongside a small
// "export just this one glyph as SVG" action that used to be the *only*
// thing the old Export menu offered in Glyph mode.

import { useState } from 'react';
import { useStore } from '../state/store.js';
import { Modal } from './Modal.jsx';
import { FontExportPanel } from './glyph/FontExportPanel.jsx';
import { LockIcon, UnlockIcon } from './icons.jsx';
import { sizeFromScale, resizeLockedDimension } from '../export/raster/rasterSize.js';

const RASTER_SCALES = [1, 4, 8, 16];

const DRAW_CHECKBOX_ROWS = [
  { key: 'svg', label: 'SVG (active frame)' },
  { key: 'png', label: 'PNG (active frame)' },
  { key: 'webp', label: 'WebP (active frame)' },
];
const ANIMATED_CHECKBOX_ROWS = [
  { key: 'animatedSvg', label: 'Animated SVG (whole animation)' },
  { key: 'spriteSheet', label: 'Sprite Sheet (PNG + JSON)' },
  { key: 'spriteArchive', label: 'Sprite Archive (frames as separate files)' },
  { key: 'gif', label: 'Animated GIF' },
];
const RASTER_KEYS = ['png', 'webp', 'spriteSheet', 'spriteArchive', 'gif'];

/** The "Advanced…" dialog: a custom uniform scale, or a specific resolution with an optional locked aspect ratio (unlocked stretches non-uniformly — vector art has no native resolution to distort). */
function AdvancedRasterModal({ canvasWidth, canvasHeight, initialSize, onApply, onClose }) {
  const [mode, setMode] = useState(/** @type {'scale'|'resolution'} */ ('scale'));
  const [scale, setScale] = useState(Math.max(canvasWidth ? initialSize.width / canvasWidth : 1, 0.1));
  const [width, setWidth] = useState(initialSize.width);
  const [height, setHeight] = useState(initialSize.height);
  const [lockAspect, setLockAspect] = useState(true);

  function handleWidthChange(value) {
    if (lockAspect) {
      const next = resizeLockedDimension(canvasWidth, canvasHeight, 'width', value);
      setWidth(next.width);
      setHeight(next.height);
    } else {
      setWidth(value);
    }
  }
  function handleHeightChange(value) {
    if (lockAspect) {
      const next = resizeLockedDimension(canvasWidth, canvasHeight, 'height', value);
      setWidth(next.width);
      setHeight(next.height);
    } else {
      setHeight(value);
    }
  }

  function handleApply() {
    onApply(mode === 'scale' ? sizeFromScale(canvasWidth, canvasHeight, scale) : { width, height });
    onClose();
  }

  return (
    <Modal title="Raster Export Size" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 260 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="radio" checked={mode === 'scale'} onChange={() => setMode('scale')} /> Scale
          </label>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="radio" checked={mode === 'resolution'} onChange={() => setMode('resolution')} /> Specific resolution
          </label>
        </div>

        {mode === 'scale' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Scale
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" min={0.1} step={0.5} value={scale} onChange={(e) => setScale(Math.max(0.1, Number(e.target.value)))} style={{ width: 80 }} />
              <span>x</span>
            </div>
          </label>
        )}

        {mode === 'resolution' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Width (px)
              <input type="number" min={1} value={width} onChange={(e) => handleWidthChange(Number(e.target.value))} style={{ width: 100 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Height (px)
              <input type="number" min={1} value={height} onChange={(e) => handleHeightChange(Number(e.target.value))} style={{ width: 100 }} />
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} />
              {lockAspect ? <LockIcon size={16} /> : <UnlockIcon size={16} />}
              Lock aspect ratio
            </label>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </Modal>
  );
}

function DrawExportForm({ onClose }) {
  const canvas = useStore((s) => s.canvas);
  const exportDrawAssets = useStore((s) => s.exportDrawAssets);

  const isAnimated = canvas.frameCount > 1;
  const [selected, setSelected] = useState({ svg: true, png: false, webp: false, animatedSvg: false, spriteSheet: false, spriteArchive: false, gif: false });
  const [presetScale, setPresetScale] = useState(4);
  const [customSize, setCustomSize] = useState(/** @type {{width:number,height:number}|null} */ (null));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const anySelected = Object.values(selected).some(Boolean);
  const anyRasterSelected = RASTER_KEYS.some((key) => selected[key]);
  const resolvedSize = customSize ?? sizeFromScale(canvas.width, canvas.height, presetScale);

  function toggle(key) {
    setSelected((s) => ({ ...s, [key]: !s[key] }));
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportDrawAssets(selected, resolvedSize);
      onClose();
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 300 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {DRAW_CHECKBOX_ROWS.map(({ key, label }) => (
          <label key={key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={Boolean(selected[key])} onChange={() => toggle(key)} />
            {label}
          </label>
        ))}
        {isAnimated && ANIMATED_CHECKBOX_ROWS.map(({ key, label }) => (
          <label key={key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={Boolean(selected[key])} onChange={() => toggle(key)} />
            {label}
          </label>
        ))}
      </div>

      {anyRasterSelected && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            Raster size
            <select
              value={customSize ? '' : presetScale}
              onChange={(e) => {
                setCustomSize(null);
                setPresetScale(Number(e.target.value));
              }}
            >
              {customSize && <option value="">Custom: {customSize.width}×{customSize.height}px</option>}
              {RASTER_SCALES.map((s) => (
                <option key={s} value={s}>{s}x</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={() => setAdvancedOpen(true)}>Advanced…</button>
        </div>
      )}

      <button className="btn btn-primary" onClick={handleExport} disabled={!anySelected || exporting} style={{ alignSelf: 'flex-end' }}>
        {exporting ? 'Exporting…' : 'Export'}
      </button>

      {advancedOpen && (
        <AdvancedRasterModal
          canvasWidth={canvas.width}
          canvasHeight={canvas.height}
          initialSize={resolvedSize}
          onApply={setCustomSize}
          onClose={() => setAdvancedOpen(false)}
        />
      )}
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
