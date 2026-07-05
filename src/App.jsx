import { useEffect, useState } from 'react';
import { useStore } from './state/store.js';
import { Toolbar } from './ui/draw/Toolbar.jsx';
import { PaletteSimple } from './ui/draw/PaletteSimple.jsx';
import { ImportImagePanel } from './ui/draw/ImportImagePanel.jsx';
import { SvgPixelEditor } from './ui/draw/SvgPixelEditor.jsx';
import { TilePreviewPanel } from './ui/draw/TilePreviewPanel.jsx';

const ANCHORS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];

function CanvasSizeControl() {
  const width = useStore((s) => s.canvas.width);
  const height = useStore((s) => s.canvas.height);
  const resizeCanvas = useStore((s) => s.resizeCanvas);
  const [nextWidth, setNextWidth] = useState(width);
  const [nextHeight, setNextHeight] = useState(height);
  const [anchor, setAnchor] = useState('top-left');

  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <input type="number" min={1} max={512} value={nextWidth} onChange={(e) => setNextWidth(Number(e.target.value))} style={{ width: 56 }} />
      x
      <input type="number" min={1} max={512} value={nextHeight} onChange={(e) => setNextHeight(Number(e.target.value))} style={{ width: 56 }} />
      <select value={anchor} onChange={(e) => setAnchor(e.target.value)}>
        {ANCHORS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <button onClick={() => resizeCanvas(nextWidth, nextHeight, anchor)}>Resize</button>
    </span>
  );
}

function ExportMenu() {
  const exportSvg = useStore((s) => s.exportSvg);
  const exportRaster = useStore((s) => s.exportRaster);
  const copySvg = useStore((s) => s.copySvg);
  const saveProject = useStore((s) => s.saveProject);
  const openProject = useStore((s) => s.openProject);
  const [scale, setScale] = useState(4);

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <button onClick={saveProject}>Save .pixelyph</button>
      <button onClick={openProject}>Open .pixelyph</button>
      <span style={{ borderLeft: '1px solid #444', paddingLeft: 6 }}>
        <button onClick={exportSvg}>Export SVG</button>
        <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
          {[1, 4, 8, 16].map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
        <button onClick={() => exportRaster('png', scale)}>Export PNG</button>
        <button onClick={() => exportRaster('webp', scale)}>Export WebP</button>
        <button onClick={copySvg}>Copy as SVG</button>
      </span>
    </span>
  );
}

function useAutosaveRecovery() {
  const checkAutosaveRecovery = useStore((s) => s.checkAutosaveRecovery);
  const resumeAutosave = useStore((s) => s.resumeAutosave);
  const discardAutosave = useStore((s) => s.discardAutosave);

  useEffect(() => {
    let cancelled = false;
    checkAutosaveRecovery().then((doc) => {
      if (cancelled || !doc) return;
      if (window.confirm('Pixelyph found an autosaved session from last time. Resume it? (Cancel discards it and starts fresh.)')) {
        resumeAutosave(doc);
      } else {
        discardAutosave();
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default function App() {
  useAutosaveRecovery();

  return (
    <main style={{ fontFamily: 'sans-serif', background: '#121212', color: '#eee', minHeight: '100vh' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '0.5rem 1rem', background: '#1a1a1a', borderBottom: '1px solid #333' }}>
        <h1 style={{ fontSize: '1.1rem', margin: 0 }}>Pixelyph</h1>
        <CanvasSizeControl />
        <ExportMenu />
      </header>
      <Toolbar />
      <PaletteSimple />
      <ImportImagePanel />
      <div style={{ padding: '1rem' }}>
        <SvgPixelEditor />
      </div>
      <TilePreviewPanel />
    </main>
  );
}
