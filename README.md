# Pixelyph

[![test](https://github.com/Rhapsydian/pixelyph/actions/workflows/test.yml/badge.svg)](https://github.com/Rhapsydian/pixelyph/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A pixel-art and pixel-font editor that outputs scalable SVG (and real font files) via [pixelloom](https://github.com/Rhapsydian/pixelloom), instead of raster images.

**Live demo:** [rhapsydian.github.io/pixelyph](https://rhapsydian.github.io/pixelyph/)

## Status

Early development. Draw mode (both tiers, with frame-based animation), Glyph mode, project management (startup screen, new-project wizard, autosave recovery), font compilation, and the Electron desktop shell are implemented — see "Features" below. A visual design pass is still ahead.

## Features

**Draw mode** — a live SVG pixel editor, not a Canvas2D approximation: the editing surface is the same `composeLayersSvg` output that gets exported (gradients, stroke, and filters included), so what you see while drawing is exactly what you get.

- Tools: pencil, eraser, bucket fill, eyedropper, line, rectangle, ellipse (both outline and filled), and a rectangular marquee selection with move/copy/paste — Enter commits a move in place, Escape cancels it, Ctrl+A/C/X/V select-all/copy/cut/paste (an app-internal clipboard)
- Right-click erases instead of paints for pencil, bucket fill, line, rectangle, and ellipse — no need to switch to the eraser tool for a quick correction mid-stroke
- Symmetry/mirror drawing (horizontal, vertical, or both), applied uniformly across every tool
- Zoom, toggleable grid overlay, undo/redo
- Checkerboard backdrop so an unpainted/transparent cell is never confused with one painted white
- Palette swatches with Lospec `.hex` palette import
- Raster image import — downsamples and quantizes a PNG/JPEG/etc. into editable pixel layers (nearest-neighbor or area-averaging, matched to the existing palette or a freshly generated one)
- Reference-image underlay for trace-over work (display-only, never exported)
- Tile/pattern preview for checking seamless textures
- Canvas resize with anchor-aware crop/pad
- Export to SVG, PNG, or WebP (at 1x/4x/8x/16x), Copy-as-SVG to the clipboard, and `.pixelyph` project save/load — exported SVG layers get a CSS-selectable `id` derived from the layer name
- Autosave to IndexedDB with resume-on-launch recovery

**Simple tier** hides layer management behind auto-managed, one-per-color layers — paint and the bookkeeping happens for you. **Advanced tier** exposes real layers with independent style:

- Layers panel: add/remove/reorder/duplicate/merge-down (merging keeps the bottom layer's style, matching Photoshop/Aseprite convention), visible/locked toggles, opacity, and an eyedropper that activates a layer instead of sampling a color (unambiguous once gradients exist)
- Selection scope toggle: marquee select/copy/cut can read from just the active layer, or from whichever visible layer is topmost at each cell — paste always lands on the active layer either way
- Per-layer fill: solid, linear gradient, or radial gradient (editable stops/angle/center)
- Per-layer stroke: color, width, cap, join, and dash array
- Per-layer effects: drop-shadow, blur, and a glow preset (a zero-offset, brightened drop-shadow)
- Tier toggle: simple → advanced is always safe; advanced → simple asks for confirmation, since it collapses every layer to its topmost visible color per cell (gradients and free-floating positions don't survive the trip)

**Animation** — every layer carries a uniform number of frames (adding/duplicating/removing a frame does it across every layer at once, so they never drift out of sync), works in both tiers:

- Frame strip: add, duplicate, delete, and click-to-select frames, each shown as a live thumbnail, with its own duration (milliseconds) editable per frame — a "default FPS" control sets the pace for newly-added frames only, it doesn't retroactively rescale existing ones
- In-editor Play/Pause preview: steps through the actual editing surface on a timer using each frame's own duration, looping — manually selecting a frame (or a project switch) pauses it, the same "scrubbing takes back control" convention most animation/video players use
- Onion skinning: a faded, color-tinted (reddish/bluish) preview of the adjacent frame(s) rendered behind the one actually being edited
- Export a self-contained, looping **animated SVG** (one `<g>` per frame, each with its own CSS `@keyframes` rule sized to its own duration's share of the total cycle, offset by a negative delay equal to the cumulative duration of every frame before it — so frames can each run at a different speed, not just a uniform rate)
- Export a **sprite sheet**: a single-row PNG tiling every frame plus a JSON metadata sidecar (`{frames:[{x,y,w,h,duration}]}`, TexturePacker/Aseprite-style — `duration` is per-frame, in milliseconds), bundled as one `.zip`
- Export an **animated GIF** via [gifenc](https://github.com/mattdesl/gifenc) (pure JS, no native dependency — same reasoning as the font pipeline's WASM/pure-JS picks), with real GIF transparency for fully-transparent pixels
- Both raster animation exports reuse the same single-frame `rasterizeFrame` rasterizer PNG/WebP export already uses, called once per animation frame

**Glyph mode** — one plain grid per glyph rather than layered artwork. Reuses the exact same live-SVG pixel editor as Draw mode (same tools, undo/redo, zoom/pan, grid overlay) via a single-color pseudo-canvas adapter, so there's no separate glyph-painting implementation:

- `GlyphSet`/`Glyph` model in two kinds: **character** sets (one Unicode codepoint per glyph, assigned by typing the character itself or `U+00E9`) and **icon** sets (named glyphs with auto-assigned Private Use Area codepoints the user never has to type)
- Character-map grid with starter charset presets (Basic Latin, Latin-1 Supplement, Symbols) showing a thumbnail or empty placeholder per codepoint; reassigning an already-used codepoint asks for confirmation before replacing it
- Shared thumbnail browser for both kinds — sorted by codepoint or by name, with search/filter — click a thumbnail to make it the active glyph
- Font metadata form (family/style name, units-per-em, ascender/descender, baseline row, icon tile padding), with a confirm-before-resize prompt when changing pixels-per-em, since that crops or pads every glyph's grid
- Specimen preview: a live text-entry preview for character sets, or clickable icon swatches that insert into the same preview for icon sets
- Per-glyph SVG export (via pixelloom's `gridToSvg` directly, no layering/style pipeline needed) and `.pixelyph` save/load for glyph-kind projects
- Marquee-select/copy-paste works the same as Draw mode, including pasting a selection copied from one glyph into a different glyph after switching the active glyph — a shared app-level clipboard makes that fall out for free

**Font compilation** — compiles the current GlyphSet into a real, installable font, via [opentype.js](https://github.com/opentypejs/opentype.js):

- Exports **OTF** (CFF-flavored OpenType — the one binary format opentype.js can actually produce when building a font from scratch) plus derived **WOFF**
- Icon-kind sets additionally export **CSS + a JSON manifest** (`@font-face` and one `.icon-{name}::before` rule per glyph, IcoMoon/Fontello-style — referencing only whichever font file(s) were actually included in that export), with an `iconTilePadding` option so equal-width icons tile edge-to-edge with zero gap (or a consistent gap at a positive value)
- Every export also produces a self-contained, double-click-openable **demo HTML** file — a live text-entry specimen preview for character fonts, or clickable icon swatches plus a tiling test strip for icon fonts — with the font base64-embedded inline and a small "Made with Pixelyph" footer linking back to the live demo, no separate asset to keep track of
- WOFF2 export is currently disabled — it reliably hangs in a real browser/Electron environment rather than compiling — see `BACKLOG.md`
- Checking more than one export option bundles the results into a single `.zip` (a small dependency-free writer, `export/zip.js`) instead of triggering one save dialog per file; a single selected format still saves directly

**Project management** — a startup screen on launch instead of silently booting into Draw mode:

- Three choices: **New Project** (opens a wizard), **Existing Project** (file picker, kind-dispatching — opens the matching mode automatically), and **Continue Last Session** (only shown when IndexedDB has an autosave snapshot)
- New Project wizard: Draw (mode choice only, uses standard defaults) or Glyph (mode + kind: characters/icons, family name, and initial charset preset for character sets)
- Mode is chosen once at project creation — not toggled mid-session; opening a new project while one is open asks for confirmation first
- A **File** dropdown menu in the header (New/Open/Save Project, plus the mode-appropriate export actions) replaces both the old mode-switcher toggle and, in the Electron build, the native OS menu bar — the same DOM menu renders identically in both, so there's exactly one implementation of "the file menu" instead of two

Behind the UI, `src/model`, `src/export`, and `src/io/projectFile.js` (including `GlyphSet.js` and `charsetPresets.js`) are pure data/functions with no DOM dependency — the same style as pixelloom's own `trace.js`/`index.js` — and are covered by `node --test`.

**Electron desktop shell** — the exact same `src/` code as the web build, wrapped by `electron-vite`; only `src/io/platform.js` and `src/io/autosave.js` branch on `isElectron()` to call through IPC instead of the web APIs:

- Save/Open dialogs are native OS file pickers (`electron/main/index.js`'s `dialog.showSaveDialog`/`showOpenDialog`) instead of the File System Access API or a download link
- Autosave writes to a JSON file in the app's userData directory instead of IndexedDB
- `electron/preload/index.js` exposes the narrow `window.pixelyph.{saveFile,openFile,writeAutosave,readAutosave,clearAutosave}` bridge those two files already expected
- Electron's own native menu bar is disabled (`Menu.setApplicationMenu(null)`) in favor of the app's DOM-based File menu (see "Project management" above) — one menu implementation, not two
- Packaged for Windows via `electron-builder` (NSIS installer); macOS/Linux targets are a config addition away, not attempted yet

## Development

```sh
npm install
npm run dev            # start the web dev server
npm test                # run node --test
npm run electron:dev    # start the Electron app (HMR renderer)
npm run electron:build  # build electron/, out/main + out/preload + out/renderer
npm run dist:win        # build, then package a Windows installer into release/
```

## Backlog

[`BACKLOG.md`](./BACKLOG.md) tracks features that were built and then deliberately hidden or disabled behind a known issue (rather than shipped half-broken or removed outright — the underlying logic is left intact so restoring them later is a small, targeted change), plus open ideas flagged for future discussion rather than acted on immediately.

## Session logs

The [`session-logs/`](./session-logs/) directory contains a markdown log for each Claude Code session used to build Pixelyph, written from the actual session transcripts. Each log covers the goal, key decisions (with rationale), work completed, and what was deferred. They are intended as a transparent record of how the project was conceived and built, and as a demonstration of AI-assisted development as a practical workflow.

## License

MIT
