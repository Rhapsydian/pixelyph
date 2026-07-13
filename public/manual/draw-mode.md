# Draw Mode

Draw mode is a live SVG pixel editor, not a Canvas2D approximation — the
editing surface is the same markup that gets exported (gradients, stroke,
and filters included), so what you see while drawing is exactly what you
get.

## Tools

The tool rail (left edge) holds: pencil, eraser, bucket fill, eyedropper,
line, rectangle, ellipse (outline or filled), a rectangular marquee
selection, and a dedicated **Move** tool.

- **Right-click erases** instead of paints for pencil, bucket fill, line,
  rectangle, and ellipse — a quick correction mid-stroke without switching
  tools.
- **Brush width** (1–8px) applies to pencil/eraser/line; pencil also has a
  dithering (checkerboard texture) option and pixel-perfect corner
  correction.
- **Bucket fill** has a color-tolerance slider and a global (non-contiguous,
  whole-canvas) mode.
- **Symmetry/mirror drawing** (horizontal, vertical, or both) applies
  uniformly across every tool.

## Selection, copy, and paste

The marquee tool selects a rectangular region. Enter commits a move in
place; Escape cancels it as a true no-op — nothing touches the real
document until you commit. Ctrl+A/C/X/V select-all/copy/cut/paste using an
app-internal clipboard; pasting something just copied or cut from the same
project lands back at its original position instead of re-centering.

Pasting an image from another app (a screenshot, etc.) lands it as a
floating selection too, downsampled to fit if the source is larger than
the canvas. On Shape tier, a multi-color external paste additionally asks
**Paste as: Multiple shapes (by color)** (full color fidelity) or
**Single shape** (unions it into one paintable shape — useful for
importing a silhouette or mask).

## The Move tool

Click a shape directly (Shape tier) to select and drag it — or, with
"Select from: Active layer," every shape in that shape's layer moves
together. On Pixel tier or in Glyph mode, drag anywhere to shift the whole
active layer's content. Each drag is a single undo step regardless of
length. Arrow keys nudge too (Shift for a 10px step instead of 1px) — see
[Keyboard Shortcuts](keyboard-shortcuts.md).

## Pixel tier vs. Shape tier

**Pixel tier** auto-manages one shape per color per layer — paint and the
bookkeeping happens for you, no manual shape authoring needed. **Shape
tier** additionally exposes manual shape/style authoring: each layer
expands to show its individual Shapes as indented sub-rows in the Layers
panel, each with its own fill, stroke, and effects.

Switching Pixel → Shape is always safe. Switching Shape → Pixel asks for
confirmation, since it collapses each layer's shapes down to its topmost
visible color per cell — gradients, stroke, effects, and multiple shapes
per layer don't survive the trip (layer count/order/names/lock/opacity
do).

## Layers panel

Both tiers share one Layers panel: a live thumbnail per layer,
add/remove/reorder/duplicate/merge-down, a lock toggle, opacity, and an
eyedropper that activates a layer instead of sampling a color. On Shape
tier, each layer expands to its Shapes with the same set of per-row
controls, plus their own add/reorder/duplicate/merge-down/delete toolbar.

Visibility is per-frame, not per-layer — the eye toggle only hides a layer
in whichever frame is currently active, so different frames of the same
animation can each hide different layers.

On Shape tier, a **Selection scope** toggle controls whether marquee
select/copy/cut/transform and the Move tool's click-to-drag act on just
the active shape (the default) or every shape in the active layer
together.

## Fill, stroke, and effects (Shape tier)

Each shape's fill can be solid or a gradient (linear or radial) via the
Gradient Editor — a draggable stop bar with live preview, plus on-canvas
handles for rotation/endpoints (linear) or center/radius/focal-point
(radial). Shapes also get an independent stroke (color, width, join, dash
array) and effects (drop-shadow, blur, or a glow preset). Any fill or a
layer's whole style can be saved to the shared palette and reapplied
elsewhere.

Color inputs throughout use one consistent swatch-and-popover: a hex field
(3/4/6/8-digit shorthand), R/G/B/A sliders, and a custom saturation/value +
hue picker with a real screen-sampling eyedropper.

## Palette

The Palette panel holds three groups: **Colors**, **Gradients**, and saved
**Styles** (a whole fill+stroke+effects combination). New projects start
with the PICO-8 16-color palette plus a few starter gradients and styles.
Import accepts a Lospec `.hex` file, a previously-exported Pixelyph
palette, or a palette generated from any image. The whole palette can be
exported back out for reuse across projects.

## Transform

The **Transform** menu offers **Resize…** (width/height plus a 3×3
anchor-grid picker for crop/pad direction) and **Flip**/**Rotate**
(90° clockwise, 90° counter-clockwise, 180°), each targeting **Canvas**,
**Layer**, or **Shape** (Shape only in Shape tier, once a shape is
active). When a marquee selection is active, Flip/Rotate instead act
directly on the selection's contents and stay pending — composable with a
drag-move, finalized with Enter or a click outside, cancelable with
Escape.

## Viewport and canvas

Scroll wheel over the canvas zooms in/out directly. A viewport minimap
above the side panel's tabs shows a full-canvas thumbnail with a draggable
pan rectangle once you're zoomed in past what's visible. A toggleable grid
overlay and an independent tile/sub-grid guide (a heavier line every N
cells) help with tileset work. A checkerboard backdrop keeps an unpainted
cell from being confused with one painted white.

## Import

**File → Import Image…** downsamples and quantizes a PNG/JPEG/etc. into
editable pixel layers. **File → Reference Image…** adds a display-only
underlay for trace-over work — it's never exported.
