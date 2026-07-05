// Export options branch on GlyphSet.kind (per the plan's "Icon fonts as a
// second Glyph-mode target" note): character fonts get OTF/WOFF + demo
// HTML; icon fonts get those plus CSS + JSON manifest. There's no real
// "TTF" option — opentype.js only ever produces CFF-flavored OpenType
// output when building a font from scratch (see compileFont.js), so OTF is
// the one binary format offered rather than presenting a second button that
// would just save the identical bytes under a misleading .ttf name.
//
// WOFF2 is hidden for now — see BACKLOG.md and state/store.js's
// WOFF2_EXPORT_ENABLED — it reliably times out rather than compiling in a
// real browser/Electron environment. Restore this row (and flip that flag)
// once that's fixed.

import { useState } from 'react';
import { useStore } from '../../state/store.js';

const CHECKBOX_ROWS = [
  { key: 'otf', label: 'OTF font file' },
  { key: 'woff', label: 'WOFF' },
  { key: 'demoHtml', label: 'Demo HTML (specimen preview)' },
];

export function FontExportPanel() {
  const glyphSet = useStore((s) => s.glyphSet);
  const exportFont = useStore((s) => s.exportFont);
  const [selected, setSelected] = useState({ otf: true, woff: false, demoHtml: true, cssManifest: false });
  const [exporting, setExporting] = useState(false);
  const [woff2Warning, setWoff2Warning] = useState(false);

  if (!glyphSet) return null;

  const isIconFont = glyphSet.kind === 'icons';
  const rows = isIconFont ? [...CHECKBOX_ROWS, { key: 'cssManifest', label: 'CSS + JSON manifest' }] : CHECKBOX_ROWS;
  const anySelected = Object.values(selected).some(Boolean);
  // The generated CSS's @font-face only references formats actually
  // included in the export (see iconFontCss.js) — without OTF or WOFF
  // alongside it, that CSS has nothing to point at.
  const cssManifestNeedsAFontFile = selected.cssManifest && !selected.otf && !selected.woff;

  function toggle(key) {
    setSelected((s) => ({ ...s, [key]: !s[key] }));
  }

  async function handleExport() {
    setExporting(true);
    setWoff2Warning(false);
    try {
      const result = await exportFont(selected);
      setWoff2Warning(Boolean(result?.woff2Failed));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ padding: '0.5rem', background: '#1e1e1e', color: '#eee', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 }}>
      <strong>Export Font</strong>
      {glyphSet.glyphs.size === 0 && <span style={{ color: '#888', fontSize: '0.85em' }}>Draw at least one glyph before exporting.</span>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(({ key, label }) => (
          <label key={key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={Boolean(selected[key])} onChange={() => toggle(key)} />
            {label}
          </label>
        ))}
      </div>
      {cssManifestNeedsAFontFile && (
        <span style={{ color: '#e0b04d', fontSize: '0.8em' }}>
          Check OTF or WOFF too — the generated CSS needs a font file to actually point at.
        </span>
      )}
      <button onClick={handleExport} disabled={!anySelected || cssManifestNeedsAFontFile || exporting || glyphSet.glyphs.size === 0}>
        {exporting ? 'Exporting…' : 'Export'}
      </button>
      {woff2Warning && (
        <span style={{ color: '#e0b04d', fontSize: '0.8em' }}>
          WOFF2 compression didn't complete (timed out) — the other selected files were still exported; any demo HTML falls back to WOFF.
        </span>
      )}
    </div>
  );
}
