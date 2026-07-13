# Export

Export lives in one place: **File → Export…**. It opens a modal with the
actual export settings rather than a menu crowded with dropdowns, and it's
mode-aware — Draw mode and Glyph mode each show a different form.

## Draw mode export

Check any combination of formats and export them all at once:

- **SVG** — the active frame's real, editable vector markup. Exported
  layers get a CSS-selectable `id` derived from the layer name.
- **PNG** / **WebP** — the active frame, rasterized.
- **Animated SVG** *(multi-frame projects)* — a self-contained, looping
  file where each frame can run at its own speed.
- **Sprite Sheet** *(multi-frame)* — one tiled PNG plus a JSON metadata
  sidecar (TexturePacker/Aseprite-style: `{frames:[{x,y,w,h,duration}]}`).
- **Sprite Archive** *(multi-frame)* — each frame as its own file, PNG,
  SVG, or both, plus a duration-metadata sidecar.
- **Animated GIF** *(multi-frame)* — real GIF transparency for fully-
  transparent pixels.
- **Animated PNG (APNG)** *(multi-frame)* — lossless, full alpha
  transparency, natively supported by every current browser.

Checking more than one format bundles the result into a single `.zip`; a
single checked format saves directly.

### Raster scale

PNG, WebP, Sprite Sheet, Sprite Archive (PNG), and GIF/APNG all share one
**Raster Scale** control — the usual 1x/4x/8x/16x presets. The
**Advanced…** dialog offers a custom scale multiplier, or a specific
target resolution with an optional locked aspect ratio (unlocked stretches
non-uniformly, since vector art has no native resolution to distort).

## Glyph mode export

**Export Active Glyph SVG** exports just the glyph currently open for
editing, with no layering/style pipeline involved (glyphs are plain
grids, not layered artwork).

Below that, the same panel compiles the whole GlyphSet into a real,
installable font:

- **OTF** (CFF-flavored OpenType) plus derived **WOFF**.
- Icon sets additionally export **CSS + a JSON manifest** (`@font-face`
  and one `.icon-{name}::before` rule per glyph), with an icon-tile-padding
  option so equal-width icons tile edge-to-edge.
- Every export also produces a self-contained **demo HTML** file — a
  live specimen preview with the font embedded inline, double-click-
  openable with no separate asset to keep track of.
- **WOFF2** export is currently disabled — it reliably hangs in a real
  browser/Electron environment rather than compiling. See the project's
  `BACKLOG.md` for status.

Checking more than one format bundles the results into a single `.zip`,
same as Draw mode.

## Project files

`.pixelyph` project save/load lives off the **File** menu directly (Save
Project / Open Project…), separate from the Export modal — a `.pixelyph`
file is Pixelyph's own re-editable project format, not an export target
for use elsewhere.
