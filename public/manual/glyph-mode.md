# Glyph Mode

Glyph mode designs pixel fonts and icon sets — one plain grid per glyph,
rather than layered artwork. It reuses the exact same live-SVG pixel
editor as [Draw Mode](draw-mode.md) (same tools, undo/redo, zoom/pan, grid
overlay), so everything you already know about drawing carries over
directly.

## One glyph, any identity

A glyph can freely have a real typed character, a free-form name, both, or
neither — there's no locked-at-creation choice between a "character set"
and an "icon set" the way earlier versions worked. A single project can
mix typed Latin letters alongside hand-named icon glyphs.

- Click **+** (next to the sort toggle) to add one bare glyph immediately
  — it's auto-keyed and selected right away, ready to edit.
- The Character/Name fields always edit whichever glyph is currently
  selected. Typing a real character (paste it directly, or type `U+00E9`,
  `&hearts;`, or `&#x2764;`) re-keys the glyph to that codepoint; typing
  over an already-used codepoint asks for confirmation before replacing
  it. Leaving Character blank auto-assigns a Private-Use-Area codepoint
  instead — the same kind of codepoint an "icon" used to get, just without
  a separate project-level mode to choose it.
- A small caution badge appears on a glyph's thumbnail whenever it's
  missing *both* a real codepoint and a name, or whenever its grid is
  still empty — having just one of Character/Name is enough identity to
  clear the badge on its own.

## Bulk-adding glyphs

**Bulk Add…** opens a modal to create many empty-grid glyphs at once:
check one or more starter charset presets (Basic Latin, Latin-1
Supplement, Symbols) and confirm — every codepoint in the checked
preset(s) that doesn't already have a glyph gets one, with its real
codepoint set and an empty grid ready to draw into. Codepoints that
already exist are skipped, so it's safe to run against an in-progress
project. Choosing an initial charset preset in the New Project wizard
does the same thing upfront, at project creation.

## Navigating glyphs

A shared thumbnail browser lists every glyph, sorted by codepoint or name
with search/filter. Click a thumbnail to make it the active glyph and
start editing it.

## Font metadata

The font metadata form covers family/style name, units-per-em,
ascender/descender, baseline row, and Horizontal Padding. Changing
pixels-per-em asks for confirmation first, since it crops or pads every
glyph's grid to match.

Horizontal Padding applies to every glyph — added on top of whichever
bearing/advance a glyph already has (an auto-assigned glyph starts flush
with a width-only advance; a typed glyph uses its own bearing/advance).
Set it above 0 for breathing room between glyphs in the compiled font, or
leave it at 0 for edge-to-edge tiling — see "Getting seamless tile edges"
below.

## Editing a glyph

Symmetry/mirror drawing and the rectangle/ellipse Filled toggle work
exactly as in Draw mode. Flip (horizontal/vertical) has no side effects;
90° rotation swaps width/height, so if that doesn't match the font's
shared pixels-per-em, it re-crops/pads back afterward behind a
confirmation — shown only when the rotation would actually lose content.

Marquee select/copy/paste works the same as Draw mode too, including
pasting a selection copied from one glyph into a different glyph after
switching — Pixelyph's clipboard is shared across the whole app.

A Glyph-mode-only display-color control, next to the grid toggle, changes
what color the active glyph's pixels render as on the canvas — purely a
viewing preference, not saved, exported, or part of undo history. Useful
if a glyph is hard to see against the canvas background in its default
color.

## Specimen preview

One always-shown, multi-line text box previews how glyphs read together
as you build them out. Type directly for anything with a real, typeable
character; click a glyph's swatch in the "Insert glyph" row to add it to
the preview instead — the only way to add an auto-assigned glyph, since
it has no natural keystroke of its own.

Each line lays out left-to-right using the glyph's real font metrics —
the exact same spacing the compiled font will actually use, not an
approximation. A **Preview color** picker sets the color newly-inserted
glyphs are stamped with; glyphs already in the preview keep their own
locked-in color even if you change the picker afterward, until **Apply to
all** recolors everything at once. The panel itself can be resized (drag
its top edge) or minimized (the caret next to its title).

### Getting seamless tile edges

To make consecutive glyphs touch with zero gap — useful for checking an
icon font that's meant to tile, or just for a tight character font — set
Horizontal Padding to 0 in Font Metadata, and for any typed glyph you want
gapless, make sure its own bearing is 0 and its advance width equals its
grid width (both stored per-glyph; there's no separate "tile mode" toggle
— gapless tiling is just what these font-metadata fields already produce
when set to touch).

## Exporting

Per-glyph SVG export is available directly, with no layering/style
pipeline involved. Every glyph set can export CSS + a JSON manifest
alongside the font file (one `.icon-{name}::before` rule per named glyph)
— there's no longer a project kind gating that option on. For compiling
the whole set into an installable font, see [Export](export.md).
