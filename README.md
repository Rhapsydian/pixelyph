# Pixelyph

[![test](https://github.com/Rhapsydian/pixelyph/actions/workflows/test.yml/badge.svg)](https://github.com/Rhapsydian/pixelyph/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A pixel-art and pixel-font editor that outputs scalable SVG (and real font files) via [pixelloom](https://github.com/Rhapsydian/pixelloom), instead of raster images.

**Live demo:** [rhapsydian.github.io/pixelyph](https://rhapsydian.github.io/pixelyph/)

## Status

Early development. Draw mode (both the simple and advanced tiers) is implemented — see "Features" below. Glyph mode, font export, the Electron desktop shell, animation, and a visual design pass are still ahead.

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

Behind the UI, `src/model`, `src/export`, and `src/io/projectFile.js` are pure data/functions with no DOM dependency — the same style as pixelloom's own `trace.js`/`index.js` — and are covered by `node --test`.

## Development

```sh
npm install
npm run dev    # start the dev server
npm test       # run node --test
```

## License

MIT
