# Draw Mode

Draw mode is where you make pixel art: illustrations, sprites, tilesets,
and animations. Under the hood, Pixelyph draws with real SVG shapes rather
than a raster grid, so what you see while drawing — gradients, strokes,
filters and all — is exactly what you'll get when you export.

This page walks through the main things you'll do in Draw mode. For
frame-by-frame animation specifically, see [Animation](animation.md).

## Drawing your first pixels

The tool rail on the left edge holds your drawing tools: **pencil**,
**eraser**, **bucket fill**, **eyedropper** (pick a color off the canvas),
**line**, **rectangle**, **ellipse**, a rectangular **marquee** selection
tool, and a dedicated **Move** tool.

Pick a color from the Palette panel (see "Building your palette" below),
select the pencil, then click and drag on the canvas to draw. A few things
worth knowing right away:

- **Right-click paints with the eraser** instead of the current tool, for
  pencil, bucket fill, line, rectangle, and ellipse — handy for a quick
  correction mid-stroke without switching tools.
- **Brush width** (1–8px) is available for pencil, eraser, and line, along
  with a dithering (checkerboard texture) option and pixel-perfect corner
  correction for the pencil.
- **Bucket fill** has a color-tolerance slider, plus a "global" mode that
  fills every matching pixel on the canvas instead of just the connected
  region you clicked.
- **Symmetry/mirror drawing** (horizontal, vertical, or both) mirrors
  every stroke automatically, for any tool — useful for characters, icons,
  or anything meant to be symmetrical.

## Selecting, copying, and moving

Use the marquee tool to draw a rectangular selection. Once you have a
selection:

- Drag it (or use the Move tool) to reposition it — nothing is actually
  changed in your project until you commit the move.
- **Enter** commits the move in place; **Escape** cancels it completely,
  leaving the canvas exactly as it was.
- **Ctrl+A / Ctrl+C / Ctrl+X / Ctrl+V** select all, copy, cut, and paste,
  using a clipboard that's shared across the whole app — you can copy from
  one project or glyph and paste into another. Pasting something you just
  copied or cut from the same project puts it back at its original spot
  instead of centering it.

You can also paste an image copied from another app (a screenshot, for
example) — it lands as a selection you can position, shrinking to fit if
it's larger than your canvas. If you're on Shape tier and paste a
multi-color image, Pixelyph asks whether to bring it in as **multiple
shapes** (one per color, full fidelity) or a **single shape** (everything
merged into one paintable shape — handy for a silhouette or mask).

## The Move tool

On **Shape tier**, click a shape directly to select and drag just that
shape — or switch "Select from" to "Active layer" to drag every shape in
that layer together. On **Pixel tier**, or in Glyph mode, dragging
anywhere moves the whole active layer's content. However far you drag, it
counts as one undo step. Arrow keys nudge the same target by 1px (hold
Shift for 10px) — see [Keyboard Shortcuts](keyboard-shortcuts.md) for the
full picture of what nudge affects.

## Working with layers

Every Draw-mode project has one or more **layers** — think of them like
stacked transparent sheets, each with its own content, that combine to
form the final image. The Layers panel (in the side panel) shows a live
thumbnail of each layer, with controls to add, remove, reorder, duplicate,
and merge layers down into the one below. Each layer also has a lock
toggle and an opacity slider, and the eyedropper can activate a layer
instead of sampling a color.

One thing to know: a layer's visibility (its eye icon) is per-frame, not
global — hiding a layer only affects whichever frame you're currently
looking at, so different frames of an animation can each show a different
combination of layers.

## Pixel tier vs. Shape tier — which do I need

Every Draw-mode project uses one of two tiers, and you can see which by
checking the Layers panel:

- **Pixel tier** is the simpler option: paint with a color, and Pixelyph
  automatically keeps track of the shapes behind the scenes — there's
  nothing to manage manually. Good for straightforward pixel art.
- **Shape tier** unlocks manual control: each layer expands to show its
  individual shapes as indented rows underneath it, and each shape gets
  its own fill, stroke, and effects (see the next section).

You can switch from Pixel to Shape tier at any time with no downside. Going
the other way — Shape back to Pixel — asks you to confirm first, because
it flattens each layer down to whatever color is on top in each cell:
gradients, strokes, effects, and multiple shapes per layer don't survive
the trip (your layer count, order, names, lock state, and opacity all do).

## Giving a shape fill, stroke, and effects (Shape tier)

On Shape tier, each shape can have:

- A **fill** — solid or a gradient (linear or radial), adjustable in the
  Gradient Editor with a draggable stop bar and on-canvas handles for
  rotating or repositioning it.
- A **stroke** — its own color, width, corner join style, and dash
  pattern.
- **Effects** — drop-shadow, blur, or a glow preset.

Any fill you like, or a layer's whole combination of fill + stroke +
effects, can be saved to the palette as a reusable style (see below) and
applied elsewhere later.

Wherever you pick a color in Pixelyph, you get the same color picker: a
hex field (3/4/6/8-digit shorthand), R/G/B/A sliders, and a
saturation/value + hue picker with a real screen-sampling eyedropper.

## Building your palette

The Palette panel holds three sections: **Colors**, **Gradients**, and
saved **Styles** (a complete fill + stroke + effects combination you can
reapply). Every new project starts with the 16-color PICO-8 palette plus a
few starter gradients and styles to get you going.

You can import a palette from a Lospec `.hex` file, from a `.pixelyph`
palette file you exported earlier, or generate one directly from an image.
The whole palette can also be exported for reuse in another project.

## Resizing, flipping, and rotating

The **Transform** menu offers **Resize…** (set a new width/height, with a
3×3 grid to pick which direction the canvas grows or shrinks from) and
**Flip**/**Rotate** (90° clockwise, 90° counter-clockwise, or 180°). Each
of these targets the **Canvas**, a **Layer**, or (on Shape tier, with a
shape selected) a single **Shape**. If you have an active selection
instead, Flip/Rotate acts directly on just the selected pixels, and stays
adjustable — you can drag it around before finalizing with Enter or a
click outside, or cancel with Escape.

## Navigating the canvas

Scroll your mouse wheel over the canvas to zoom in and out. Once you're
zoomed in far enough that the whole canvas doesn't fit on screen, a
minimap above the side panel's tabs shows the full canvas with a
draggable rectangle marking your current view. A toggleable grid overlay,
plus an independent heavier line every few cells, help line things up —
useful for tileset work in particular. A checkerboard pattern shows
through anywhere nothing has been painted, so you can always tell an
empty pixel from one painted white.

## Import

**File → Import Image…** brings in a PNG, JPEG, or similar image,
shrinking and simplifying its colors so it becomes editable pixel layers.
**File → Reference Image…** instead adds a picture as a visual guide you
can trace over — it's shown on the canvas but never included in anything
you export.
