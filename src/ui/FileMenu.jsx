import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store.js';

// A single DOM-based File menu, replacing both the header's old flat row of
// buttons and Electron's native File menu (disabled in electron/main/index.js)
// — one implementation that behaves identically in the web build (which has
// no native menu to fall back on) and the desktop build.

const buttonStyle = { background: '#333', color: '#eee', border: '1px solid #555', padding: '0.35rem 0.7rem', borderRadius: 4, cursor: 'pointer' };
const dropdownStyle = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 200,
  background: '#1e1e1e',
  border: '1px solid #444',
  borderRadius: 6,
  padding: '0.25rem',
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  zIndex: 10,
};
const itemStyle = { background: 'transparent', color: '#eee', border: 'none', padding: '0.45rem 0.6rem', borderRadius: 4, cursor: 'pointer', textAlign: 'left', font: 'inherit' };
const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.6rem', color: '#ccc' };
const dividerStyle = { borderTop: '1px solid #383838', margin: '0.25rem 0' };

export function FileMenu() {
  const mode = useStore((s) => s.mode);
  const closeProject = useStore((s) => s.closeProject);
  const saveAnyProject = useStore((s) => s.saveAnyProject);
  const openAnyProject = useStore((s) => s.openAnyProject);
  const exportSvg = useStore((s) => s.exportSvg);
  const exportRaster = useStore((s) => s.exportRaster);
  const copySvg = useStore((s) => s.copySvg);
  const exportGlyphSvg = useStore((s) => s.exportGlyphSvg);

  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(4);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  function runAndClose(action) {
    return () => {
      setOpen(false);
      action();
    };
  }

  function handleNewProject() {
    if (!window.confirm('Discard the current project and return to the start screen?')) return;
    closeProject();
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button style={buttonStyle} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        File ▾
      </button>
      {open && (
        <div role="menu" style={dropdownStyle}>
          <button role="menuitem" style={itemStyle} onClick={runAndClose(handleNewProject)}>New Project…</button>
          <button role="menuitem" style={itemStyle} onClick={runAndClose(openAnyProject)}>Open Project…</button>
          <button role="menuitem" style={itemStyle} onClick={runAndClose(saveAnyProject)}>Save Project</button>
          <div style={dividerStyle} />
          {mode === 'draw' ? (
            <>
              <button role="menuitem" style={itemStyle} onClick={runAndClose(exportSvg)}>Export SVG</button>
              <div style={rowStyle}>
                Raster scale
                <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                  {[1, 4, 8, 16].map((s) => (
                    <option key={s} value={s}>{s}x</option>
                  ))}
                </select>
              </div>
              <button role="menuitem" style={itemStyle} onClick={runAndClose(() => exportRaster('png', scale))}>Export PNG</button>
              <button role="menuitem" style={itemStyle} onClick={runAndClose(() => exportRaster('webp', scale))}>Export WebP</button>
              <button role="menuitem" style={itemStyle} onClick={runAndClose(copySvg)}>Copy as SVG</button>
            </>
          ) : (
            <button role="menuitem" style={itemStyle} onClick={runAndClose(exportGlyphSvg)}>Export Glyph SVG</button>
          )}
        </div>
      )}
    </div>
  );
}
