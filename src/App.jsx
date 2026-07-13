import { useEffect, useRef, useState } from 'react';
import { useStore } from './state/store.js';
import { MenuBar } from './ui/MenuBar.jsx';
import { ToolRail } from './ui/draw/ToolRail.jsx';
import { ContextBar } from './ui/draw/ContextBar.jsx';
import { SidePanel } from './ui/SidePanel.jsx';
import { SvgPixelEditor } from './ui/draw/SvgPixelEditor.jsx';
import { FrameStrip } from './ui/draw/FrameStrip.jsx';
import { GlyphGridEditor } from './ui/glyph/GlyphGridEditor.jsx';
import { SpecimenPreviewPanel } from './ui/glyph/SpecimenPreviewPanel.jsx';
import { ManageSwatchesModal } from './ui/ManageSwatchesModal.jsx';
import { ExportModal } from './ui/ExportModal.jsx';
import { ImportImageModal } from './ui/ImportImageModal.jsx';
import { ReferenceImageModal } from './ui/ReferenceImageModal.jsx';
import { AboutModal } from './ui/AboutModal.jsx';
import { ConfirmModal } from './ui/ConfirmModal.jsx';
import { NamePromptModal } from './ui/NamePromptModal.jsx';
import { PaletteImportModeModal } from './ui/PaletteImportModeModal.jsx';
import { IconButton } from './ui/IconButton.jsx';
import { FullscreenIcon, FullscreenExitIcon, UndoIcon, RedoIcon } from './ui/icons.jsx';
import { useFullscreen } from './ui/useFullscreen.js';
import { CHARSET_PRESETS, CHARSET_PRESET_IDS } from './model/charsetPresets.js';

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

  const inputStyle = { padding: '0.4rem' };

  if (step === 'mode') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', padding: '3rem 2rem' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>New Project — Choose Mode</h2>
        <div style={{ display: 'flex', gap: '2rem' }}>
          <div className="panel" style={{ alignItems: 'center', background: 'var(--chrome-bg-panel)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem 2rem' }}>
            <strong>Draw</strong>
            <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', maxWidth: 180 }}>Pixel art with SVG export. Multi-layer, advanced fills, effects.</span>
            <button className="btn btn-primary" onClick={handleDraw}>Create Draw Project</button>
          </div>
          <div className="panel" style={{ alignItems: 'center', background: 'var(--chrome-bg-panel)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem 2rem' }}>
            <strong>Glyph / Font</strong>
            <span style={{ color: 'var(--chrome-text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', maxWidth: 180 }}>Design pixel fonts<br />or icon sets.<br />One grid per character.</span>
            <button className="btn btn-primary" onClick={handleGlyph}>Continue →</button>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '3rem 2rem' }}>
      <h2 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>New Glyph Project</h2>
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
        <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>Create Glyph Project</button>
      </form>
      <button className="btn btn-secondary" onClick={() => setStep('mode')}>← Back</button>
    </div>
  );
}

// --- Startup screen ---

function StartupScreen() {
  const checkAutosaveRecovery = useStore((s) => s.checkAutosaveRecovery);
  const resumeAutosave = useStore((s) => s.resumeAutosave);
  const openAnyProject = useStore((s) => s.openAnyProject);
  const skipToNewProjectWizard = useStore((s) => s.skipToNewProjectWizard);
  const setSkipToNewProjectWizard = useStore((s) => s.setSkipToNewProjectWizard);
  const [autosaveDoc, setAutosaveDoc] = useState(null);
  const [screen, setScreen] = useState(() => (skipToNewProjectWizard ? 'wizard' : 'main')); // 'main' | 'wizard'

  useEffect(() => {
    if (skipToNewProjectWizard) setSkipToNewProjectWizard(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (screen === 'wizard') {
    return (
      <div className="startup-overlay">
        <div className="startup-overlay__panel">
          <NewProjectWizard onBack={() => setScreen('main')} />
        </div>
      </div>
    );
  }

  return (
    <div className="startup-overlay">
      <div className="startup-overlay__panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2.5rem', padding: '3rem 2.5rem' }}>
        <h1 style={{ fontSize: 'var(--text-xl)', margin: 0, letterSpacing: '0.05em' }}>Pixelyph</h1>
        <p style={{ color: 'var(--chrome-text-muted)', margin: 0 }}>SVG pixel art &amp; font design tool</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn btn-primary" style={{ minWidth: 200 }} onClick={() => setScreen('wizard')}>New Project</button>
          <button className="btn btn-primary" style={{ minWidth: 200 }} onClick={handleOpen}>Existing Project…</button>
          {autosaveDoc ? (
            <button className="btn btn-primary" style={{ minWidth: 200 }} onClick={handleContinue}>Continue Last Session</button>
          ) : (
            <button className="btn" style={{ minWidth: 200 }} disabled title="No autosaved session found">Continue Last Session</button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main App ---

export default function App() {
  const projectOpen = useStore((s) => s.projectOpen);
  const mode = useStore((s) => s.mode);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const [isFullscreen, toggleFullscreen] = useFullscreen();

  // The editor shell renders even when no project is "open" (the store
  // always has a live default canvas — see state/store.js's initialCanvas)
  // so the startup screen / New Project wizard can overlay a dimmed,
  // inert version of it instead of replacing the whole tree.
  return (
    <>
      <div className={projectOpen ? 'app-shell' : 'app-shell app-shell--dimmed'}>
        <header className="app-header">
          <h1 className="app-logo">Pixelyph</h1>
          <MenuBar />
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            <IconButton icon={<UndoIcon />} label="Undo" disabled={!canUndo} onClick={undo} />
            <IconButton icon={<RedoIcon />} label="Redo" disabled={!canRedo} onClick={redo} />
            <IconButton
              icon={isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              active={isFullscreen}
              onClick={toggleFullscreen}
            />
          </div>
        </header>
        <ContextBar />
        <div className="app-workspace">
          <ToolRail />
          <main className="canvas-region">
            <div className="canvas-editor-area">
              {mode === 'draw' ? <SvgPixelEditor /> : <GlyphGridEditor />}
            </div>
            {mode === 'draw' ? <FrameStrip /> : <SpecimenPreviewPanel />}
          </main>
          <SidePanel />
        </div>
        {mode === 'draw' && (
          <>
            <ManageSwatchesModal />
            <ImportImageModal />
            <ReferenceImageModal />
            <PaletteImportModeModal />
          </>
        )}
        <ExportModal />
        <AboutModal />
        <ConfirmModal />
        <NamePromptModal />
      </div>
      {!projectOpen && <StartupScreen />}
    </>
  );
}
