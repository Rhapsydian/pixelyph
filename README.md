# Pixelyph

[![test](https://github.com/Rhapsydian/pixelyph/actions/workflows/test.yml/badge.svg)](https://github.com/Rhapsydian/pixelyph/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A pixel-art and pixel-font editor that outputs scalable SVG (and real font files) via [pixelloom](https://github.com/Rhapsydian/pixelloom), instead of raster images.

**Live demo:** [rhapsydian.github.io/pixelyph](https://rhapsydian.github.io/pixelyph/)

## Status

Early development. Draw mode's simple tier is implemented — see "Features" below. Advanced-tier layers, Glyph mode, font export, the Electron desktop shell, animation, and a visual design pass are still ahead.

## Features

**Draw mode (simple tier)** — a live SVG pixel editor, not a Canvas2D approximation: the editing surface is the same `gridToPath`/composed-SVG output that gets exported, so what you see while drawing is exactly what you get.

- Tools: pencil, eraser, bucket fill, eyedropper, line, rectangle, ellipse (both outline and filled), and a rectangular marquee selection with move/copy/paste
- Symmetry/mirror drawing (horizontal, vertical, or both), applied uniformly across every tool
- Zoom, toggleable grid overlay, undo/redo
- Palette swatches with Lospec `.hex` palette import
- Raster image import — downsamples and quantizes a PNG/JPEG/etc. into editable pixel layers (nearest-neighbor or area-averaging, matched to the existing palette or a freshly generated one)
- Reference-image underlay for trace-over work (display-only, never exported)
- Tile/pattern preview for checking seamless textures
- Canvas resize with anchor-aware crop/pad
- Export to SVG, PNG, or WebP (at 1x/4x/8x/16x), Copy-as-SVG to the clipboard, and `.pixelyph` project save/load
- Autosave to IndexedDB with resume-on-launch recovery

Behind the UI, `src/model`, `src/export`, and `src/io/projectFile.js` are pure data/functions with no DOM dependency — the same style as pixelloom's own `trace.js`/`index.js` — and are covered by `node --test`.

## Development

```sh
npm install
npm run dev    # start the dev server
npm test       # run node --test
```

## License

MIT
