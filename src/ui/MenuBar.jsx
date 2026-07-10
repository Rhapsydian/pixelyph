// Standard desktop-style menu bar (File / Edit / Palette / Window / Help),
// replacing the single bundled "File ▾" dropdown. Behaves like a native menu
// bar: click a top-level menu to open it; while one is open, hovering a
// sibling top-level button switches directly to it; click-outside or Escape
// closes.
//
// Export used to be its own top-level menu; it's now a single "Export…" item
// under File that opens ExportModal.jsx — a raster-scale dropdown and an
// active-frame-vs-whole-animation choice don't fit naturally as inline menu
// rows. Import Image / Reference Image moved here from a side-panel tab for
// the same reason as Export: settings, not permanent screen real estate —
// each opens its own modal (ImportImageModal.jsx / ReferenceImageModal.jsx).
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
import { useFullscreen } from './useFullscreen.js';
import { openExternalUrl } from '../io/platform.js';
import { TransformResizeModal } from './TransformResizeModal.jsx';
import { TransformScopeModal } from './TransformScopeModal.jsx';

const REPO_URL = 'https://github.com/Rhapsydian/pixelyph';

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
  const copySvg = useStore((s) => s.copySvg);
  const importLospecPalette = useStore((s) => s.importLospecPalette);
  const importPixelyphPalette = useStore((s) => s.importPixelyphPalette);
  const importPaletteFromImage = useStore((s) => s.importPaletteFromImage);
  const requestPaletteImportMode = useStore((s) => s.requestPaletteImportMode);
  const exportPalette = useStore((s) => s.exportPalette);
  const setManageSwatchesOpen = useStore((s) => s.setManageSwatchesOpen);
  const setExportModalOpen = useStore((s) => s.setExportModalOpen);
  const setImportImageModalOpen = useStore((s) => s.setImportImageModalOpen);
  const setReferenceImageModalOpen = useStore((s) => s.setReferenceImageModalOpen);
  const setAboutModalOpen = useStore((s) => s.setAboutModalOpen);
  const requestConfirm = useStore((s) => s.requestConfirm);

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

  // --- Transform menu (resize/flip/rotate) ---
  const hasActiveShape = useStore((s) => s.canvas.tier === 'advanced' && s.canvas.activeGridId != null);
  const flipCanvasH = useStore((s) => s.flipCanvasH);
  const flipCanvasV = useStore((s) => s.flipCanvasV);
  const rotateCanvas90 = useStore((s) => s.rotateCanvas90);
  const rotateCanvas180 = useStore((s) => s.rotateCanvas180);
  const rotateCanvasCCW90 = useStore((s) => s.rotateCanvasCCW90);
  const flipActiveLayerH = useStore((s) => s.flipActiveLayerH);
  const flipActiveLayerV = useStore((s) => s.flipActiveLayerV);
  const rotateActiveLayer90 = useStore((s) => s.rotateActiveLayer90);
  const rotateActiveLayer180 = useStore((s) => s.rotateActiveLayer180);
  const rotateActiveLayerCCW90 = useStore((s) => s.rotateActiveLayerCCW90);
  const flipActiveShapeH = useStore((s) => s.flipActiveShapeH);
  const flipActiveShapeV = useStore((s) => s.flipActiveShapeV);
  const rotateActiveShape90 = useStore((s) => s.rotateActiveShape90);
  const rotateActiveShape180 = useStore((s) => s.rotateActiveShape180);
  const rotateActiveShapeCCW90 = useStore((s) => s.rotateActiveShapeCCW90);
  const flipActiveGlyphH = useStore((s) => s.flipActiveGlyphH);
  const flipActiveGlyphV = useStore((s) => s.flipActiveGlyphV);
  const rotateActiveGlyph90 = useStore((s) => s.rotateActiveGlyph90);
  const rotateActiveGlyph180 = useStore((s) => s.rotateActiveGlyph180);
  const rotateActiveGlyphCCW90 = useStore((s) => s.rotateActiveGlyphCCW90);
  const [resizeModalOpen, setResizeModalOpen] = useState(false);
  // The pending flip/rotate operation awaiting a target ("Canvas"/"Layer"/
  // "Shape") and, unless Shape is picked, a frame-scope answer — null means
  // no modal is open. Only Draw mode ever sets this: "Canvas or Layer"
  // (Pixel tier) / "Canvas, Layer, or Shape" (Shape tier) is always a real
  // choice there, even with just one layer. Glyph mode has no target
  // concept (no layers/shapes), so its Flip/Rotate items run directly.
  const [pendingTransform, setPendingTransform] = useState(
    /** @type {{title: string, actionsByTarget: Record<string, () => void>}|null} */ (null),
  );

  const [openMenu, setOpenMenu] = useState(/** @type {string|null} */ (null));
  const [isFullscreen, toggleFullscreen] = useFullscreen();
  const rootRef = useRef(null);
  const paletteFileInputRef = useRef(null);
  const paletteImageInputRef = useRef(null);

  async function handleImportPaletteFile(evt) {
    const file = evt.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (!importPixelyphPalette(text)) importLospecPalette(text);
    evt.target.value = '';
  }

  async function handleImportPaletteImageFile(evt) {
    const file = evt.target.files?.[0];
    if (!file) return;
    const mode = await requestPaletteImportMode();
    if (mode) await importPaletteFromImage(file, { mode });
    evt.target.value = '';
  }

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

  async function handleNewProject() {
    if (!(await requestConfirm('Discard the current project and return to the start screen?'))) return;
    closeProject();
  }

  function handleDeselect() {
    if (floatingSelection) cancelFloatingSelection();
    else if (selection) clearSelection();
  }

  const hasSelection = Boolean(selection || floatingSelection);

  /**
   * Flip/Rotate menu items funnel through here rather than straight to
   * runAndClose: Glyph mode has no target concept (no layers/shapes), so
   * `glyphAction` just runs directly. Draw mode always opens the scope
   * modal — "Canvas or Layer" (Pixel tier) / "Canvas, Layer, or Shape"
   * (Shape tier) is always a real choice, even with just one layer.
   * `layerActions`/`shapeActions` are `{h, v, cw, ccw, r180}` — `shapeActions`
   * is omitted entirely when Shape tier has no active grid to target.
   */
  function runTransform(title, op, glyphAction, canvasAction, layerActions, shapeActions) {
    return () => {
      setOpenMenu(null);
      if (mode === 'glyph') {
        glyphAction();
        return;
      }
      const actionsByTarget = { canvas: canvasAction, layer: layerActions[op] };
      if (shapeActions) actionsByTarget.shape = shapeActions[op];
      setPendingTransform({ title, actionsByTarget });
    };
  }

  const layerActions = { h: flipActiveLayerH, v: flipActiveLayerV, cw: rotateActiveLayer90, ccw: rotateActiveLayerCCW90, r180: rotateActiveLayer180 };
  const shapeActions = hasActiveShape
    ? { h: flipActiveShapeH, v: flipActiveShapeV, cw: rotateActiveShape90, ccw: rotateActiveShapeCCW90, r180: rotateActiveShape180 }
    : null;

  return (
    <div ref={rootRef} style={{ display: 'flex' }}>
      <Menu id="file" label="File" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <MenuItem label="New Project…" onClick={runAndClose(handleNewProject)} />
        <MenuItem label="Open Project…" onClick={runAndClose(openAnyProject)} />
        <MenuItem label="Save Project" onClick={runAndClose(saveAnyProject)} />
        {mode === 'draw' && (
          <>
            <MenuDivider />
            <MenuItem label="Import Image…" onClick={runAndClose(() => setImportImageModalOpen(true))} />
            <MenuItem label="Reference Image…" onClick={runAndClose(() => setReferenceImageModalOpen(true))} />
          </>
        )}
        <MenuDivider />
        <MenuItem label="Export…" onClick={runAndClose(() => setExportModalOpen(true))} />
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
        {mode === 'draw' && (
          <>
            <MenuDivider />
            <MenuItem label="Copy SVG (for Illustrator, Inkscape, etc.)" onClick={runAndClose(copySvg)} />
          </>
        )}
      </Menu>

      {mode === 'draw' && (
        <Menu id="palette" label="Palette" openMenu={openMenu} setOpenMenu={setOpenMenu}>
          <MenuItem label="Manage Swatches…" onClick={runAndClose(() => setManageSwatchesOpen(true))} />
          <MenuDivider />
          <MenuItem label="Import Palette…" onClick={runAndClose(() => paletteFileInputRef.current?.click())} />
          <MenuItem label="Import Palette from Image…" onClick={runAndClose(() => paletteImageInputRef.current?.click())} />
          <MenuItem label="Export Palette" onClick={runAndClose(exportPalette)} />
        </Menu>
      )}
      <input ref={paletteFileInputRef} type="file" accept=".hex,.txt,.json" onChange={handleImportPaletteFile} style={{ display: 'none' }} />
      <input ref={paletteImageInputRef} type="file" accept="image/*" onChange={handleImportPaletteImageFile} style={{ display: 'none' }} />

      <Menu id="transform" label="Transform" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <MenuItem label="Resize…" onClick={runAndClose(() => setResizeModalOpen(true))} />
        <MenuDivider />
        <MenuItem
          label="Flip Horizontal"
          onClick={runTransform('Flip Horizontal', 'h', flipActiveGlyphH, flipCanvasH, layerActions, shapeActions)}
        />
        <MenuItem
          label="Flip Vertical"
          onClick={runTransform('Flip Vertical', 'v', flipActiveGlyphV, flipCanvasV, layerActions, shapeActions)}
        />
        <MenuDivider />
        <MenuItem
          label="Rotate 90° CW"
          onClick={runTransform('Rotate 90° CW', 'cw', rotateActiveGlyph90, rotateCanvas90, layerActions, shapeActions)}
        />
        <MenuItem
          label="Rotate 90° CCW"
          onClick={runTransform('Rotate 90° CCW', 'ccw', rotateActiveGlyphCCW90, rotateCanvasCCW90, layerActions, shapeActions)}
        />
        <MenuItem
          label="Rotate 180°"
          onClick={runTransform('Rotate 180°', 'r180', rotateActiveGlyph180, rotateCanvas180, layerActions, shapeActions)}
        />
      </Menu>

      <Menu id="window" label="Window" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <MenuItem label={isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen'} onClick={runAndClose(toggleFullscreen)} />
      </Menu>

      <Menu id="help" label="Help" openMenu={openMenu} setOpenMenu={setOpenMenu}>
        <MenuItem label="About Pixelyph" onClick={runAndClose(() => setAboutModalOpen(true))} />
        <MenuItem label="Visit on GitHub" onClick={runAndClose(() => openExternalUrl(REPO_URL))} />
      </Menu>

      {resizeModalOpen && <TransformResizeModal onClose={() => setResizeModalOpen(false)} />}
      {pendingTransform && (
        <TransformScopeModal
          title={pendingTransform.title}
          actionsByTarget={pendingTransform.actionsByTarget}
          onClose={() => setPendingTransform(null)}
        />
      )}
    </div>
  );
}
