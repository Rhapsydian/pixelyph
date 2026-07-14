# Export

Every export option lives in one place: **File → Export…**. It opens a
modal with the actual settings for whatever you're exporting, and it
adapts to your project — Draw mode and Glyph mode each show a different
set of options.

## Exporting from Draw mode

Check any combination of the formats below, then export — checking more
than one bundles everything into a single `.zip`; checking just one saves
that file directly.

- **SVG** — your active frame's real, editable vector artwork. Each
  layer gets its own CSS-selectable `id`, based on the layer's name.
- **PNG** / **WebP** — your active frame, rendered as a raster image.
- **Animated SVG** *(if your project has more than one frame)* — a single
  self-contained, looping file, with each frame able to run at its own
  speed.
- **Sprite Sheet** *(multi-frame)* — one tiled PNG plus a JSON file
  describing each frame's position (TexturePacker/Aseprite-style).
- **Sprite Archive** *(multi-frame)* — each frame saved as its own file,
  PNG, SVG, or both, plus a small file listing each frame's duration.
- **Animated GIF** *(multi-frame)* — real transparency for fully
  transparent pixels.
- **Animated PNG (APNG)** *(multi-frame)* — lossless, with full
  transparency, supported natively by every current browser.

### Understanding raster scale

PNG, WebP, Sprite Sheet, Sprite Archive (PNG), and GIF/APNG exports all
share one **Raster Scale** setting, with quick presets for 1x/4x/8x/16x.
The **Advanced…** option lets you set an exact scale multiplier instead,
or a specific pixel resolution — optionally with the aspect ratio locked
(unlocking it stretches non-uniformly, since vector art has no native
resolution to be distorted from).

## Exporting from Glyph mode

**Export Active Glyph SVG** exports just the one glyph you currently have
open, as a plain SVG with no layering involved (glyphs are simple grids,
not layered artwork like Draw mode).

Below that, the same panel can compile your entire glyph set into a real,
installable font:

- **OTF** (a CFF-flavored OpenType font) plus a derived **WOFF** file.
- If your set is being used as icons, you can also export **CSS plus a
  JSON manifest** — an `@font-face` rule and one `.icon-{name}::before`
  rule per glyph — with an option to pad each icon so equal-width icons
  tile edge-to-edge.
- Every export also produces a self-contained **demo HTML** file: a live
  specimen preview with your font embedded directly inside it, so you can
  just double-click it to open and check your work with no separate files
  to keep track of.

As with Draw mode, checking more than one format bundles everything into
a single `.zip`.

## Project files vs. exports

A `.pixelyph` file is different from anything above — it's Pixelyph's own
project format, meant to be reopened and kept editable, not a format for
using your art elsewhere. Saving and opening `.pixelyph` files lives
directly on the **File** menu (Save Project / Open Project…), separate
from the Export modal.
