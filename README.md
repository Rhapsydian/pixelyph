# Pixelyph

[![test](https://github.com/Rhapsydian/pixelyph/actions/workflows/test.yml/badge.svg)](https://github.com/Rhapsydian/pixelyph/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A pixel-art and pixel-font editor that outputs scalable SVG (and real font files) via [pixelloom](https://github.com/Rhapsydian/pixelloom), instead of raster images.

**Live demo:** [rhapsydian.github.io/pixelyph](https://rhapsydian.github.io/pixelyph/)

## Status

Early development. Draw mode (both tiers), Glyph mode, and project management (startup screen, new-project wizard, autosave recovery) are implemented — see "Features" below. Font compilation/export, the Electron desktop shell, animation, and a visual design pass are still ahead.

## Features

**Draw mode** — a live SVG pixel editor, not a Canvas2D approximation: the editing surface is the same `composeLayersSvg` output that gets exported (gradients, stroke, and filters included), so what you see while drawing is exactly what you get.

- Tools: pencil, eraser, bucket fill, eyedropper, line, rectangle, ellipse (both outline and filled), and a rectangular marquee selection with move/copy/paste — Enter commits a move in place, Escape cancels it, Ctrl+A/C/X/V select-all/copy/cut/paste (an app-internal clipboard)
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

**Simple tier** hides layer management behind auto-managed, one-per-color layers — paint and the bookkeeping happens for you. **Advanced tier** exposes real layers with independent position and style:

- Layers panel: add/remove/reorder/duplicate/merge-down (merging keeps the bottom layer's style, matching Photoshop/Aseprite convention), visible/locked toggles, opacity, per-layer offset (move), and an eyedropper that activates a layer instead of sampling a color (unambiguous once gradients exist)
- Selection scope toggle: marquee select/copy/cut can read from just the active layer, or from whichever visible layer is topmost at each cell — paste always lands on the active layer either way
- Per-layer fill: solid, linear gradient, or radial gradient (editable stops/angle/center)
- Per-layer stroke: color, width, cap, join, and dash array
- Per-layer effects: drop-shadow, blur, and a glow preset (a zero-offset, brightened drop-shadow)
- Tier toggle: simple → advanced is always safe; advanced → simple asks for confirmation, since it collapses every layer to its topmost visible color per cell (gradients and free-floating positions don't survive the trip)

**Glyph mode** — one plain grid per glyph rather than layered artwork. Reuses the exact same live-SVG pixel editor as Draw mode (same tools, undo/redo, zoom/pan, grid overlay) via a single-color pseudo-canvas adapter, so there's no separate glyph-painting implementation:

- `GlyphSet`/`Glyph` model in two kinds: **character** sets (one Unicode codepoint per glyph, assigned by typing the character itself or `U+00E9`) and **icon** sets (named glyphs with auto-assigned Private Use Area codepoints the user never has to type)
- Character-map grid with starter charset presets (Basic Latin, Latin-1 Supplement, Symbols) showing a thumbnail or empty placeholder per codepoint; reassigning an already-used codepoint asks for confirmation before replacing it
- Shared thumbnail browser for both kinds — sorted by codepoint or by name, with search/filter — click a thumbnail to make it the active glyph
- Font metadata form (family/style name, units-per-em, ascender/descender, baseline row, icon tile padding), with a confirm-before-resize prompt when changing pixels-per-em, since that crops or pads every glyph's grid
- Specimen preview: a live text-entry preview for character sets, or clickable icon swatches that insert into the same preview for icon sets
- Per-glyph SVG export (via pixelloom's `gridToSvg` directly, no layering/style pipeline needed) and `.pixelyph` save/load for glyph-kind projects
- Marquee-select/copy-paste is Draw-mode only for now, deferred to a later phase

**Project management** — a startup screen on launch instead of silently booting into Draw mode:

- Three choices: **New Project** (opens a wizard), **Existing Project** (file picker, kind-dispatching — opens the matching mode automatically), and **Continue Last Session** (only shown when IndexedDB has an autosave snapshot)
- New Project wizard: Draw (mode choice only, uses standard defaults) or Glyph (mode + kind: characters/icons, family name, and initial charset preset for character sets)
- Mode is chosen once at project creation — not toggled mid-session; opening a new project while one is open asks for confirmation first
- **New Project** and **Save Project** buttons in the header replace the old mode-switcher toggle

Behind the UI, `src/model`, `src/export`, and `src/io/projectFile.js` (including `GlyphSet.js` and `charsetPresets.js`) are pure data/functions with no DOM dependency — the same style as pixelloom's own `trace.js`/`index.js` — and are covered by `node --test`.

## Development

```sh
npm install
npm run dev    # start the dev server
npm test       # run node --test
```

## License

MIT
