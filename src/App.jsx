import { useEffect, useState } from 'react';
import { useStore } from './state/store.js';
import { Toolbar } from './ui/draw/Toolbar.jsx';
import { PaletteSimple } from './ui/draw/PaletteSimple.jsx';
import { ImportImagePanel } from './ui/draw/ImportImagePanel.jsx';
import { SvgPixelEditor } from './ui/draw/SvgPixelEditor.jsx';
import { TilePreviewPanel } from './ui/draw/TilePreviewPanel.jsx';
import { LayersPanel } from './ui/draw/LayersPanel.jsx';
import { LayerStylePanel } from './ui/draw/LayerStylePanel.jsx';
import { GlyphGridEditor } from './ui/glyph/GlyphGridEditor.jsx';
import { CharacterMapPanel } from './ui/glyph/CharacterMapPanel.jsx';
import { GlyphSetPanel } from './ui/glyph/GlyphSetPanel.jsx';
import { FontMetadataPanel } from './ui/glyph/FontMetadataPanel.jsx';
import { SpecimenPreviewPanel } from './ui/glyph/SpecimenPreviewPanel.jsx';

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

/** Glyph mode's per-glyph analogue of CanvasSizeControl — only width is user-resizable here (height is font-wide via FontMetadataPanel's pixels-per-em). */
function GlyphSizeControl() {
  const activeCodepoint = useStore((s) => s.activeCodepoint);
  const glyphSet = useStore((s) => s.glyphSet);
  const resizeActiveGlyph = useStore((s) => s.resizeActiveGlyph);
  const glyph = activeCodepoint != null ? glyphSet?.glyphs.get(activeCodepoint) : null;
  const [nextWidth, setNextWidth] = useState(glyph?.width ?? 1);

  useEffect(() => {
    setNextWidth(glyph?.width ?? 1);
  }, [activeCodepoint, glyph?.width]);

  if (!glyph) return null;

  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      Glyph width:
      <input type="number" min={1} max={256} value={nextWidth} onChange={(e) => setNextWidth(Number(e.target.value))} style={{ width: 56 }} />
      <button onClick={() => resizeActiveGlyph(nextWidth)}>Resize</button>
    </span>
  );
}

function ModeSwitcher() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {['draw', 'glyph'].map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            fontWeight: mode === m ? 'bold' : 'normal',
            background: mode === m ? '#4da3ff' : '#333',
            color: '#fff',
            border: 'none',
            padding: '0.35rem 0.6rem',
            borderRadius: 4,
            cursor: 'pointer',
            textTransform: 'capitalize',
          }}
        >
          {m}
        </button>
      ))}
    </span>
  );
}

/** Starts a fresh GlyphSet, discarding the current one — confirms first if it has glyphs, same destructive-action pattern as Draw mode's tier toggle. */
function GlyphKindSwitcher() {
  const glyphSet = useStore((s) => s.glyphSet);
  const newGlyphProject = useStore((s) => s.newGlyphProject);

  function handleNewProject(kind) {
    if (glyphSet && glyphSet.glyphs.size > 0 && !window.confirm(`Start a new ${kind} glyph project? This discards the current one (${glyphSet.glyphs.size} glyph(s)).`)) {
      return;
    }
    newGlyphProject(kind);
  }

  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <button onClick={() => handleNewProject('characters')}>New Character Font</button>
      <button onClick={() => handleNewProject('icons')}>New Icon Font</button>
    </span>
  );
}

function ExportMenu() {
  const mode = useStore((s) => s.mode);
  const exportSvg = useStore((s) => s.exportSvg);
  const exportRaster = useStore((s) => s.exportRaster);
  const copySvg = useStore((s) => s.copySvg);
  const saveAnyProject = useStore((s) => s.saveAnyProject);
  const openAnyProject = useStore((s) => s.openAnyProject);
  const exportGlyphSvg = useStore((s) => s.exportGlyphSvg);
  const [scale, setScale] = useState(4);

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <button onClick={saveAnyProject}>Save .pixelyph</button>
      <button onClick={openAnyProject}>Open .pixelyph</button>
      {mode === 'draw' ? (
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
      ) : (
        <span style={{ borderLeft: '1px solid #444', paddingLeft: 6 }}>
          <button onClick={exportGlyphSvg}>Export Glyph SVG</button>
        </span>
      )}
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

function GlyphWorkspace() {
  const glyphSet = useStore((s) => s.glyphSet);

  if (!glyphSet) {
    return (
      <div style={{ padding: '1rem' }}>
        <GlyphKindSwitcher />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <GlyphGridEditor />
        <SpecimenPreviewPanel />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {glyphSet.kind === 'characters' && <CharacterMapPanel />}
        <GlyphSetPanel />
        <FontMetadataPanel />
        <GlyphKindSwitcher />
      </div>
    </div>
  );
}

export default function App() {
  useAutosaveRecovery();
  const mode = useStore((s) => s.mode);

  return (
    <main style={{ fontFamily: 'sans-serif', background: '#121212', color: '#eee', minHeight: '100vh' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '0.5rem 1rem', background: '#1a1a1a', borderBottom: '1px solid #333' }}>
        <h1 style={{ fontSize: '1.1rem', margin: 0 }}>Pixelyph</h1>
        <ModeSwitcher />
        {mode === 'draw' ? <CanvasSizeControl /> : <GlyphSizeControl />}
        <ExportMenu />
      </header>
      <Toolbar />
      {mode === 'draw' ? (
        <>
          <PaletteSimple />
          <ImportImagePanel />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem', alignItems: 'flex-start' }}>
            <SvgPixelEditor />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <LayersPanel />
              <LayerStylePanel />
            </div>
          </div>
          <TilePreviewPanel />
        </>
      ) : (
        <GlyphWorkspace />
      )}
    </main>
  );
}
