import { useEffect, useRef, useState } from 'react';
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
import { CHARSET_PRESETS, CHARSET_PRESET_IDS } from './model/charsetPresets.js';

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

function ExportMenu() {
  const mode = useStore((s) => s.mode);
  const exportSvg = useStore((s) => s.exportSvg);
  const exportRaster = useStore((s) => s.exportRaster);
  const copySvg = useStore((s) => s.copySvg);
  const exportGlyphSvg = useStore((s) => s.exportGlyphSvg);
  const [scale, setScale] = useState(4);

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      {mode === 'draw' ? (
        <>
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
        </>
      ) : (
        <button onClick={exportGlyphSvg}>Export Glyph SVG</button>
      )}
    </span>
  );
}

function GlyphWorkspace() {
  const glyphSet = useStore((s) => s.glyphSet);
  if (!glyphSet) return null;

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
      </div>
    </div>
  );
}

// --- New Project wizard ---

function deriveDefaultWidth(pixelsPerEm, kind) {
  return kind === 'icons'
    ? Math.max(1, Math.round(pixelsPerEm))
    : Math.max(1, Math.round(pixelsPerEm * 0.75));
}

function NewProjectWizard({ onBack }) {
  const newProject = useStore((s) => s.newProject);
  const [step, setStep] = useState('mode'); // 'mode' | 'glyph-options'
  const [glyphKind, setGlyphKind] = useState('characters');
  const [familyName, setFamilyName] = useState('Untitled');
  const [initialPreset, setInitialPreset] = useState('none');
  const [pixelsPerEm, setPixelsPerEm] = useState(16);
  const [defaultGlyphWidth, setDefaultGlyphWidth] = useState(12); // 75% of 16

  // Keep defaultGlyphWidth in sync with pixelsPerEm/kind unless the user
  // edited it manually. We track the "auto" value; if the current input matches
  // the previous auto value, auto-update continues. If the user changed it to
  // something else, we leave it alone.
  const prevAutoRef = useRef(12);
  useEffect(() => {
    const auto = deriveDefaultWidth(pixelsPerEm, glyphKind);
    // Only auto-update if the field still holds the last auto-computed value
    setDefaultGlyphWidth((prev) => (prev === prevAutoRef.current ? auto : prev));
    prevAutoRef.current = auto;
  }, [pixelsPerEm, glyphKind]);

  function handleDraw() {
    newProject('draw');
  }

  function handleGlyph() {
    setStep('glyph-options');
  }

  function handleCreateGlyph(e) {
    e.preventDefault();
    newProject('glyph', { kind: glyphKind, familyName, initialPreset, pixelsPerEm, defaultGlyphWidth });
  }

  const buttonStyle = { background: '#4da3ff', color: '#fff', border: 'none', padding: '0.6rem 1.2rem', borderRadius: 6, cursor: 'pointer', fontSize: '1rem' };
  const secondaryStyle = { background: '#333', color: '#eee', border: '1px solid #555', padding: '0.5rem 1rem', borderRadius: 6, cursor: 'pointer' };
  const inputStyle = { padding: '0.4rem', borderRadius: 4 };

  if (step === 'mode') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', padding: '3rem 2rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>New Project — Choose Mode</h2>
        <div style={{ display: 'flex', gap: '2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: '1.5rem 2rem' }}>
            <strong>Draw</strong>
            <span style={{ color: '#aaa', fontSize: '0.9em', textAlign: 'center', maxWidth: 180 }}>Pixel art with SVG export. Multi-layer, advanced fills, effects.</span>
            <button style={buttonStyle} onClick={handleDraw}>Create Draw Project</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: '1.5rem 2rem' }}>
            <strong>Glyph / Font</strong>
            <span style={{ color: '#aaa', fontSize: '0.9em', textAlign: 'center', maxWidth: 180 }}>Design pixel fonts or icon sets. One grid per character.</span>
            <button style={buttonStyle} onClick={handleGlyph}>Continue →</button>
          </div>
        </div>
        <button style={secondaryStyle} onClick={onBack}>← Back</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '3rem 2rem' }}>
      <h2 style={{ margin: 0, fontSize: '1.4rem' }}>New Glyph Project</h2>
      <form onSubmit={handleCreateGlyph} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 300 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Kind
          <select value={glyphKind} onChange={(e) => setGlyphKind(e.target.value)} style={inputStyle}>
            <option value="characters">Character font</option>
            <option value="icons">Icon font (PUA codepoints)</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Family name
          <input value={familyName} onChange={(e) => setFamilyName(e.target.value)} style={inputStyle} required />
        </label>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            Height (px per em)
            <input
              type="number" min={4} max={128} value={pixelsPerEm}
              onChange={(e) => setPixelsPerEm(Math.max(4, Math.min(128, Number(e.target.value))))}
              style={inputStyle} required
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            Default glyph width
            <input
              type="number" min={1} max={256} value={defaultGlyphWidth}
              onChange={(e) => {
                const v = Math.max(1, Math.min(256, Number(e.target.value)));
                prevAutoRef.current = v; // user override — stop auto-sync
                setDefaultGlyphWidth(v);
              }}
              style={inputStyle} required
            />
          </label>
        </div>
        {glyphKind === 'characters' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Initial charset
            <select value={initialPreset} onChange={(e) => setInitialPreset(e.target.value)} style={inputStyle}>
              <option value="none">None</option>
              {CHARSET_PRESET_IDS.map((id) => (
                <option key={id} value={id}>
                  {CHARSET_PRESETS[id].label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" style={{ ...buttonStyle, marginTop: '0.5rem' }}>Create Glyph Project</button>
      </form>
      <button style={secondaryStyle} onClick={() => setStep('mode')}>← Back</button>
    </div>
  );
}

// --- Startup screen ---

function StartupScreen() {
  const checkAutosaveRecovery = useStore((s) => s.checkAutosaveRecovery);
  const resumeAutosave = useStore((s) => s.resumeAutosave);
  const discardAutosave = useStore((s) => s.discardAutosave);
  const openAnyProject = useStore((s) => s.openAnyProject);
  const [autosaveDoc, setAutosaveDoc] = useState(null);
  const [screen, setScreen] = useState('main'); // 'main' | 'wizard'

  useEffect(() => {
    let cancelled = false;
    checkAutosaveRecovery().then((doc) => {
      if (!cancelled) setAutosaveDoc(doc);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleContinue() {
    if (autosaveDoc) resumeAutosave(autosaveDoc);
  }

  async function handleOpen() {
    await openAnyProject();
  }

  const buttonStyle = { background: '#4da3ff', color: '#fff', border: 'none', padding: '0.6rem 1.4rem', borderRadius: 6, cursor: 'pointer', fontSize: '1rem', minWidth: 200 };
  const dimStyle = { background: '#2a2a2a', color: '#666', border: '1px solid #333', padding: '0.6rem 1.4rem', borderRadius: 6, cursor: 'not-allowed', fontSize: '1rem', minWidth: 200 };

  if (screen === 'wizard') {
    return (
      <main style={{ fontFamily: 'sans-serif', background: '#121212', color: '#eee', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <NewProjectWizard onBack={() => setScreen('main')} />
      </main>
    );
  }

  return (
    <main style={{ fontFamily: 'sans-serif', background: '#121212', color: '#eee', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2.5rem' }}>
      <h1 style={{ fontSize: '2.5rem', margin: 0, letterSpacing: '0.05em' }}>Pixelyph</h1>
      <p style={{ color: '#888', margin: 0 }}>SVG pixel art &amp; font design tool</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
        <button style={buttonStyle} onClick={() => setScreen('wizard')}>New Project</button>
        <button style={buttonStyle} onClick={handleOpen}>Existing Project…</button>
        {autosaveDoc ? (
          <button style={buttonStyle} onClick={handleContinue}>Continue Last Session</button>
        ) : (
          <button style={dimStyle} disabled title="No autosaved session found">Continue Last Session</button>
        )}
      </div>
    </main>
  );
}

// --- Main App ---

export default function App() {
  const projectOpen = useStore((s) => s.projectOpen);
  const mode = useStore((s) => s.mode);
  const saveAnyProject = useStore((s) => s.saveAnyProject);
  const closeProject = useStore((s) => s.closeProject);

  if (!projectOpen) {
    return <StartupScreen />;
  }

  function handleNewProject() {
    if (!window.confirm('Discard the current project and return to the start screen?')) return;
    closeProject();
  }

  return (
    <main style={{ fontFamily: 'sans-serif', background: '#121212', color: '#eee', minHeight: '100vh' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '0.5rem 1rem', background: '#1a1a1a', borderBottom: '1px solid #333' }}>
        <h1 style={{ fontSize: '1.1rem', margin: 0 }}>Pixelyph</h1>
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <button onClick={handleNewProject} style={{ background: '#333', color: '#eee', border: '1px solid #555', padding: '0.35rem 0.7rem', borderRadius: 4, cursor: 'pointer' }}>
            New Project
          </button>
          <button onClick={saveAnyProject} style={{ background: '#4da3ff', color: '#fff', border: 'none', padding: '0.35rem 0.7rem', borderRadius: 4, cursor: 'pointer' }}>
            Save Project
          </button>
        </span>
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
