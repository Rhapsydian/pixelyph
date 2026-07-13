# Glyph Mode

Glyph mode designs pixel fonts and icon sets — one plain grid per glyph,
rather than layered artwork. It reuses the exact same live-SVG pixel
editor as [Draw Mode](draw-mode.md) (same tools, undo/redo, zoom/pan, grid
overlay), so everything you already know about drawing carries over
directly.

## Character sets vs. icon sets

Chosen when the project is created (see [Getting Started](getting-started.md)):

- **Character sets** assign one Unicode codepoint per glyph — type the
  character itself, or an explicit codepoint like `U+00E9`, to assign it.
  Starter charset presets (Basic Latin, Latin-1 Supplement, Symbols) can
  seed the character map.
- **Icon sets** use named glyphs with auto-assigned Private Use Area
  codepoints — you never have to type a codepoint yourself.

Reassigning an already-used codepoint asks for confirmation before
replacing it.

## Navigating glyphs

A shared thumbnail browser lists every glyph, sorted by codepoint or name
with search/filter. Click a thumbnail to make it the active glyph and
start editing it.

## Font metadata

The font metadata form covers family/style name, units-per-em,
ascender/descender, baseline row, and (for icon sets) tile padding.
Changing pixels-per-em asks for confirmation first, since it crops or
pads every glyph's grid to match.

## Editing a glyph

Symmetry/mirror drawing and the rectangle/ellipse Filled toggle work
exactly as in Draw mode. Flip (horizontal/vertical) has no side effects;
90° rotation swaps width/height, so if that doesn't match the font's
shared pixels-per-em, it re-crops/pads back afterward behind a
confirmation — shown only when the rotation would actually lose content.

Marquee select/copy/paste works the same as Draw mode too, including
pasting a selection copied from one glyph into a different glyph after
switching — Pixelyph's clipboard is shared across the whole app.

## Specimen preview

A live specimen preview shows either a text-entry field (character sets)
or clickable icon swatches that insert into the same preview (icon sets)
— a quick way to see how glyphs read together as you build them out.

## Exporting

Per-glyph SVG export is available directly, with no layering/style
pipeline involved. For compiling the whole set into an installable font,
see [Export](export.md).
