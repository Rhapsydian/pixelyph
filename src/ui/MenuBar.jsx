// Standard desktop-style menu bar (File / Edit / Export), replacing the
// single bundled "File ▾" dropdown. Behaves like a native menu bar: click a
// top-level menu to open it; while one is open, hovering a sibling
// top-level button switches directly to it; click-outside or Escape closes.
//
// The Edit menu's real payoff: Cut/Copy/Paste/Select All/Deselect/Commit
// Move already work today, but only via keydown handling in
// SvgPixelEditor.jsx (lines ~83-102) with no visible control anywhere —
// undiscoverable unless you already know the shortcut. Every item here
// calls the exact same store actions that handler calls; this is a second,
// visible call site, not new logic. Shortcut labels are static text
// ("Ctrl+Z"), not platform-detected — SvgPixelEditor's handler already
// accepts metaKey so Cmd still works on Mac, the label just doesn't adapt.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store.js';

function MenuItem({ label, shortcut, onClick, disabled }) {
  return (
    <button
      role="menuitem"
      className="btn"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        alignItems: 'center',
        background: 'transparent',
        border: 'none',
        borderRadius: 4,
        padding: '0.4rem 0.6rem',
        textAlign: 'left',
        font: 'inherit',
      }}
    >
      <span>{label}</span>
      {shortcut && <span style={{ color: 'var(--chrome-text-faint)', fontSize: 'var(--text-xs)' }}>{shortcut}</span>}
    </button>
  );
}

function MenuDivider() {
  return <div style={{ borderTop: '1px solid var(--chrome-border)', margin: '0.25rem 0' }} />;
}

function MenuRow({ children }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.6rem', color: 'var(--chrome-text-muted)' }}>{children}</div>;
}

function Menu({ id, label, openMenu, setOpenMenu, children }) {
  const isOpen = openMenu === id;
  return (
    <div style={{ position: 'relative' }}>
      <button
        className={isOpen ? 'btn active' : 'btn'}
        style={{ background: isOpen ? 'var(--chrome-bg-raised)' : 'transparent', border: 'none' }}
        onClick={() => setOpenMenu(isOpen ? null : id)}
        onMouseEnter={() => setOpenMenu((cur) => (cur ? id : cur))}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {label}
      </button>
      {isOpen && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 210,
            background: 'var(--chrome-bg-panel)',
            border: '1px solid var(--chrome-border-strong)',
            borderRadius: 'var(--radius-md)',
            padding: '0.25rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            zIndex: 10,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuBar() {
  const mode = useStore((s) => s.mode);
  const closeProject = useStore((s) => s.closeProject);
  const saveAnyProject = useStore((s) => s.saveAnyProject);
  const openAnyProject = useStore((s) => s.openAnyProject);
  const exportSvg = useStore((s) => s.exportSvg);
  const exportRaster = useStore((s) => s.exportRaster);
  const copySvg = useStore((s) => s.copySvg);
  const exportGlyphSvg = useStore((s) => s.exportGlyphSvg);
  const exportAnimatedSvg = useStore((s) => s.exportAnimatedSvg);
  const exportSpriteSheet = useStore((s) => s.exportSpriteSheet);
  const exportAnimatedGif = useStore((s) => s.exportAnimatedGif);
  const frameCount = useStore((s) => s.canvas.frameCount);

  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const selection = useStore((s) => s.selection);
  const floatingSelection = useStore((s) => s.floatingSelection);
  const clipboard = useStore((s) => s.clipboard);
  const copySelection = useStore((s) => s.copySelection);
  const cutSelection = useStore((s) => s.cutSelection);
  const pasteClipboard = useStore((s) => s.pasteClipboard);
  const selectAll = useStore((s) => s.selectAll);
  const clearSelection = useStore((s) => s.clearSelection);
  const cancelFloatingSelection = useStore((s) => s.cancelFloatingSelection);
  const dropFloatingSelection = useStore((s) => s.dropFloatingSelection);

  const [openMenu, setOpenMenu] = useState(/** @type {string|null} */ (null));
  const [scale, setScale] = useState(4);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!openMenu) return;
    function onDocMouseDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpenMenu(null);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpenMenu(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  function runAndClose(action) {
    return () => {
      setOpenMenu(null);
      action();
    };
  }

  function handleNewProject() {
    if (!window.confirm('Discard the current project and return to the start screen?')) return;
    closeProject();
  }

  function handleDeselect() {
    if (floatingSelection) cancelFloatingSelection();
    else if (selection) clearSelection();
  }

  const hasSelection = Boolean(selection || floatingSelection);

  return (
    <div ref={rootRef} style={{ display: 'flex' }}>
      <Menu id="file" label="File" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <MenuItem label="New Project…" onClick={runAndClose(handleNewProject)} />
        <MenuItem label="Open Project…" onClick={runAndClose(openAnyProject)} />
        <MenuItem label="Save Project" onClick={runAndClose(saveAnyProject)} />
      </Menu>

      <Menu id="edit" label="Edit" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <MenuItem label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onClick={runAndClose(undo)} />
        <MenuItem label="Redo" shortcut="Ctrl+Y" disabled={!canRedo} onClick={runAndClose(redo)} />
        <MenuDivider />
        <MenuItem label="Cut" shortcut="Ctrl+X" disabled={!hasSelection} onClick={runAndClose(cutSelection)} />
        <MenuItem label="Copy" shortcut="Ctrl+C" disabled={!hasSelection} onClick={runAndClose(copySelection)} />
        <MenuItem label="Paste" shortcut="Ctrl+V" disabled={!clipboard} onClick={runAndClose(pasteClipboard)} />
        <MenuDivider />
        <MenuItem label="Select all" shortcut="Ctrl+A" onClick={runAndClose(selectAll)} />
        <MenuItem label="Deselect" shortcut="Esc" disabled={!hasSelection} onClick={runAndClose(handleDeselect)} />
        <MenuItem label="Commit move" shortcut="Enter" disabled={!floatingSelection} onClick={runAndClose(dropFloatingSelection)} />
      </Menu>

      <Menu id="export" label="Export" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        {mode === 'draw' ? (
          <>
            <MenuItem label="Export SVG" onClick={runAndClose(exportSvg)} />
            <MenuRow>
              Raster scale
              <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                {[1, 4, 8, 16].map((s) => (
                  <option key={s} value={s}>{s}x</option>
                ))}
              </select>
            </MenuRow>
            <MenuItem label="Export PNG" onClick={runAndClose(() => exportRaster('png', scale))} />
            <MenuItem label="Export WebP" onClick={runAndClose(() => exportRaster('webp', scale))} />
            <MenuItem label="Copy as SVG" onClick={runAndClose(copySvg)} />
            {frameCount > 1 && (
              <>
                <MenuDivider />
                <MenuItem label="Export animated SVG" onClick={runAndClose(exportAnimatedSvg)} />
                <MenuItem label="Export sprite sheet (.zip)" onClick={runAndClose(() => exportSpriteSheet(scale))} />
                <MenuItem label="Export animated GIF" onClick={runAndClose(() => exportAnimatedGif(scale))} />
              </>
            )}
          </>
        ) : (
          <MenuItem label="Export glyph SVG" onClick={runAndClose(exportGlyphSvg)} />
        )}
      </Menu>
    </div>
  );
}
