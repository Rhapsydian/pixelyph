# Glyph Mode

Glyph mode is for designing pixel fonts and icon sets. Instead of one
layered picture like Draw mode, you work on many small, independent
grids — one per character or icon, called a **glyph**. It reuses the exact
same drawing tools as [Draw Mode](draw-mode.md) (pencil, eraser, zoom/pan,
undo/redo, grid overlay), so anything you already know about drawing in
Pixelyph carries straight over.

## Your first glyph

Click the **+** button (next to the sort toggle in the glyph list) to add
a new, blank glyph — it's created and selected immediately, ready for you
to start drawing on with the same tools from Draw mode.

A small caution badge appears on a glyph's thumbnail if its grid is still
empty, or if it has no identity yet (see below) — draw something and give
it a character or a name, and the badge clears.

## Naming vs. typing a real character

Every glyph can have a real typed character, a plain text name, both, or
neither — whichever fits what you're making:

- If you're building a **character font** (like a typeface for the letter
  "A"), type the real character into the Character field. You can paste
  it directly, or type it as `U+0041`, `&amp;`, or `&#65;`. If you type a
  character that's already used by another glyph, Pixelyph asks for
  confirmation before reassigning it.
- If you're building an **icon set** (like a "home" or "settings" icon
  with no natural keyboard character), give it a Name instead — or leave
  Character blank and Pixelyph assigns an internal placeholder code for
  you automatically, so it still has something to export under.

A single project can freely mix both — typed letters alongside
hand-named icons — there's no separate setting to choose between them.

## Adding many glyphs at once

Instead of adding glyphs one at a time, **Bulk Add…** opens a dialog where
you can check one or more starter character sets — Basic Latin, Latin-1
Supplement, or Symbols — and confirm. Pixelyph creates an empty, ready-
to-draw glyph for every character in the sets you checked, skipping any
that already exist in your project, so it's safe to run more than once.
(Choosing a starter set in the New Project wizard does the same thing, up
front, when you first create the project.)

## Navigating glyphs

The glyph list shows a thumbnail for every glyph in your project, sortable
by character or name, with a search box to filter. Click any thumbnail to
make it the active glyph and start editing it.

## Setting up font metadata

The font metadata form covers your font's family and style name, its
units-per-em, ascender/descender, baseline row, and horizontal padding.
Changing units-per-em (called "pixels-per-em" in the form) asks for
confirmation first, since it resizes every glyph's grid to match the new
value.

Horizontal Padding adds breathing room between every glyph when the font
is compiled — set it above 0 for normal spacing, or leave it at 0 if you
want glyphs to tile edge-to-edge with no gap (see "Getting glyphs to tile
with no gaps" below).

## Editing a glyph

Symmetry/mirror drawing and the rectangle/ellipse fill toggle work exactly
as they do in Draw mode. Flipping a glyph (horizontal or vertical) never
changes anything else; rotating 90° swaps its width and height, so if that
would no longer match your font's shared grid size, Pixelyph re-crops or
pads it back afterward — but only asks for confirmation if that rotation
would actually lose part of the drawing.

Selecting, copying, and pasting also work the same as Draw mode, including
pasting something you copied from one glyph into a completely different
glyph — Pixelyph's clipboard is shared across the whole app, not scoped to
a single glyph.

Next to the grid toggle, a Glyph-mode-only color control lets you change
what color the current glyph's pixels are shown in — purely to make it
easier to see against the canvas background. It's just a viewing
preference: it isn't saved, exported, or part of your undo history.

## Previewing your font

A specimen preview box, always visible while you work, shows how your
glyphs read together as text. Type directly for anything with a real
character; for a glyph you gave an internal placeholder code (like an
icon), click its swatch in the "Insert glyph" row instead — since it has
no keyboard character of its own to type.

Each line lays out using your font's actual metrics, so what you see here
is the same spacing your compiled font will use — not an approximation. A
**Preview color** picker sets the color for anything you add to the
preview from now on; glyphs already in the preview keep whatever color
they were added with until you click **Apply to all** to recolor
everything at once. You can resize the panel by dragging its top edge, or
minimize it with the caret next to its title.

## Getting glyphs to tile with no gaps

If you want consecutive glyphs to touch with zero space between them —
for an icon font meant to tile, or just a very tight character font — set
Horizontal Padding to 0 in Font Metadata. Then, for each glyph you want
gapless, make sure its own bearing is 0 and its advance width equals its
grid width. There's no separate "tile mode" switch; gapless tiling is
just what these settings produce naturally when set to touch.

## Exporting

You can export the glyph you're currently editing as a single SVG file at
any time. When you're ready to export the whole set, every glyph set can
also produce CSS plus a JSON manifest alongside the compiled font (one
`.icon-{name}::before` rule per named glyph) — see [Export](export.md) for
the full list of formats and how to compile your glyphs into an
installable font.
