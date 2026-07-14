# Pixelyph

[![test](https://github.com/Rhapsydian/pixelyph/actions/workflows/test.yml/badge.svg)](https://github.com/Rhapsydian/pixelyph/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A pixel-art and pixel-font editor that outputs scalable SVG (and real font files) via [pixelloom](https://github.com/Rhapsydian/pixelloom), instead of raster images.

**Live demo:** [rhapsydian.github.io/pixelyph](https://rhapsydian.github.io/pixelyph/)

## Status

Early development, but broadly functional. Draw mode (Pixel and Shape tiers, multi-layer, frame-based animation, animated GIF/PNG export), Glyph mode, project management (startup screen, new-project wizard, autosave recovery), font compilation, an in-app User Manual, the Electron desktop shell (with a CI-built Windows installer available from the Help menu), a full visual design pass (real app layout, token-based dark theme, viewport minimap, resizable panels), and a functional Palette/Layers/Style review (a shared, exportable palette covering colors/gradients/saved styles, per-layer thumbnails, a custom-built HSV color picker, a Transform menu with a Canvas/Layer/Shape target picker, and on-canvas gradient handles) are all implemented — see "Features" below. SVG pattern fills were built and then deliberately removed, pending a real authoring UI; auto-update for the Windows build is scoped but deferred behind an unresolved local packaging issue (see `BACKLOG.md`). Glyph mode is mid-refactor: the old character-font/icon-font split is being unified into one glyph model that can freely mix typed characters and auto-keyed icons in a single project — 8 of 12 planned checkpoints are shipped (see `BACKLOG.md` for what's left).

For a detailed history of what shipped when and why, see `BACKLOG.md`'s "DONE" entries and the per-session logs in [`docs/session-logs/`](./docs/session-logs/).

## Features

**Draw mode** is a live SVG pixel editor, not a Canvas2D approximation — the editing surface is the same markup that gets exported, so what you see while drawing is exactly what you get. It covers a full tool set (pencil, eraser, bucket fill, eyedropper, line, rectangle, ellipse, marquee select/move/transform), symmetry drawing, an app-styled color picker, resize/flip/rotate, a viewport minimap, and a multi-format export modal (SVG, PNG, WebP, and more).

**Pixel tier** auto-manages one shape per color per layer; **Shape tier** adds full manual authoring — per-shape gradients, stroke, effects, and independent transforms — on top of the same Layers panel both tiers share.

**Animation** gives every layer a uniform, per-frame timeline with onion skinning and an in-editor play/pause preview, exporting to animated SVG, sprite sheets, sprite archives, animated GIF, or animated PNG (APNG).

**Glyph mode** designs pixel fonts and icon sets on the same live pixel editor as Draw mode, one grid per glyph. A glyph can freely have a real typed character, a name, both, or neither — no more locked-at-creation character-font/icon-font split — with a unified glyph browser (caution badges for incomplete glyphs, codepoint/name sorting), a specimen preview, and per-glyph SVG export. (Bulk-adding a charset preset and the Specimen Preview's multi-color redesign are still in progress — see `BACKLOG.md`.)

**Font compilation** turns a GlyphSet into a real, installable font (OTF/WOFF, plus an optional CSS + JSON manifest for any glyph set) via [opentype.js](https://github.com/opentypejs/opentype.js), with a self-contained demo HTML file bundled into every export.

**Project management** greets you with a startup screen (New Project wizard, Existing Project, or Continue Last Session) instead of silently booting into Draw mode, and autosaves to recover from an unexpected close.

**Electron desktop shell** packages the exact same web codebase as a Windows desktop app via `electron-vite`/`electron-builder`, with native save/open dialogs and file-based autosave in place of the browser APIs. CI (`.github/workflows/release.yml`) builds and publishes the Windows installer on a tagged release; **Help → Download for Windows** links to the latest one.

See [`docs/features.md`](./docs/features.md) for the full, detailed feature list.

## User Manual

Pixelyph has an in-app manual (Help → User Manual) that remembers which
page and scroll position you were on when you close and reopen it. It's
plain markdown, so it's just as readable straight from GitHub:

- [Getting Started](./public/manual/getting-started.md)
- [Draw Mode](./public/manual/draw-mode.md)
- [Glyph Mode](./public/manual/glyph-mode.md)
- [Animation](./public/manual/animation.md)
- [Export](./public/manual/export.md)
- [Keyboard Shortcuts](./public/manual/keyboard-shortcuts.md)

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

## Documentation

[`docs/`](./docs/) holds the core artwork data model (Canvas → Layer → Frame → Grid — exact shapes, the active-grid selection pointer, the auto grow/shrink and merge algorithms, the save-file migration path) and a markdown session log for each Claude Code session used to build Pixelyph, written from the actual session transcripts as a transparent record of how the project was conceived and built and a demonstration of AI-assisted development as a practical workflow. See [`docs/README.md`](./docs/README.md) for what's where.

## License

MIT
