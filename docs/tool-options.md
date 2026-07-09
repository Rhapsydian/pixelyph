# Tool review: brush width, lasso select, dithering, fill tolerance

**Status:** design spec only — nothing here is implemented. Written session
20 (2026-07-09) against the tool set as it exists after that session; see
`BACKLOG.md`'s "Tool review" entry for how this fits into the backlog, and
`docs/README.md` for what else lives in `docs/`.

**Scope:** the four concrete gaps identified by reading every file in
`src/ui/draw/tools/` against typical pixel-art/vector tool sets. Each
section below states the current behavior (with file/line grounding, not
guesswork), the proposed design, and the real implementation cost — some
turned out smaller than they first looked once the relevant code was
actually read, some bigger.

## Shared background: the tool API surface

Every tool (`src/ui/draw/tools/*.js`) is a plain object with
`onPointerDown`/`onPointerMove`/`onPointerUp(ctx, x, y)`. `ctx` is built
once in `SvgPixelEditor.jsx` (`useMemo`, lines ~194-248) as getters/methods
that read and mutate the store: `ctx.activeColor`, `ctx.shapeFilled`,
`ctx.canvasWidth/Height`, `ctx.paintCellLive(x, y, color)`,
`ctx.colorAt(x, y)`, `ctx.setPreview(cells)`, plus selection ops. Any new
per-tool setting (brush width, dither on/off, fill tolerance) follows the
exact precedent `shapeFilled` already sets: a flat field next to
`activeTool`/`activeColor` in `state/store.js` (working-session state, not
undo-tracked — `store.js` line ~225-227), a `setX` action, a `get x()`
getter added to `ctx`, and a UI control that only renders while the
relevant tool is active — the same pattern `ContextBar.jsx`'s
`showsShapeToggle` (`activeTool === 'rectangle' || 'ellipse'`) already uses
for the Filled checkbox.

`paintCellLive` (`store.js` lines 273-286) already applies symmetry
mirroring *per cell* — it calls `mirrorPoints` and paints every mirrored
point for whatever single `(x, y)` it's given. This matters a lot for the
brush-width design below: a multi-cell brush stamp just becomes N separate
`paintCellLive` calls, one per stamp cell, and mirroring composes for free
with zero special-casing.

## 1. Brush width for pencil/eraser/line

**Current state:** `pencil.js`, `eraser.js`, and `line.js` each paint
exactly one cell per pointer position (pencil/eraser) or one Bresenham-line
cell (`computeLineCells` in `line.js`) — there is no brush-radius concept
anywhere in the paint path. Bucket fill and eyedropper have no equivalent
concept to add (fill is region-based, eyedropper reads one cell).
Rectangle/ellipse already have `shapeFilled` (`ContextBar.jsx`'s "Filled"
checkbox) — a different axis (solid vs. outline) than brush size.

**Do not confuse this with the Shape-tier stroke width that already
ships**: `LayerStylePanel.jsx`'s `stroke.width` input controls a shape's
*outline thickness at render/export time*, applied to the whole SVG path
after the fact. It has nothing to do with how many cells a live pencil/
eraser stroke touches while drawing. Same word, unrelated feature.

**Proposed design:**
- New store field `brushWidth: 1` + `setBrushWidth`, alongside
  `shapeFilled` (`store.js` ~225-227).
- New shared helper, e.g. `src/ui/draw/tools/brush.js`:
  ```js
  /** @returns {{x:number,y:number}[]} offsets of an NxN square stamp centered on (cx, cy) */
  export function brushCells(cx, cy, width) {
    if (width <= 1) return [{ x: cx, y: cy }];
    const half = Math.floor((width - 1) / 2); // top-left bias on even widths
    const cells = [];
    for (let dy = 0; dy < width; dy++) {
      for (let dx = 0; dx < width; dx++) cells.push({ x: cx - half + dx, y: cy - half + dy });
    }
    return cells;
  }
  ```
  Square stamp for v1 (simplest, matches how most pixel-art tools default
  at small sizes where square-vs-round is barely visible); a round/diamond
  stamp option is a reasonable v2 addition, not a blocker for v1.
- `pencil.js`/`eraser.js`: replace the single `ctx.paintCellLive(x, y, ...)`
  call with `for (const c of brushCells(x, y, ctx.brushWidth)) ctx.paintCellLive(c.x, c.y, color)`.
- `line.js`: apply `brushCells` to *every* cell `computeLineCells` returns,
  both for the live preview and the final paint. Out-of-bounds stamp cells
  need clamping/dropping — `Grid.set` already clips out-of-bounds writes
  (per `rectangle.js`'s header comment), so `paintCellLive` calls for
  off-canvas stamp cells are already safe no-ops; no new bounds-checking
  code needed.
- **Real cost to flag, not a blocker:** a wide brush dragged along a long
  line can call `paintCellLive` many times per pointer-move tick (width² ×
  line-length in the worst case) — each call is a small mutation +
  `mirrorPoints` scan, not expensive individually, but this is worth a
  quick perf sanity check (a max canvas size, max brush width, full-canvas
  diagonal line, in a real browser) before shipping, not before scoping.
- **UI surface:** a numeric stepper (1-8px, matching `stroke.width`'s
  `<input type="number">` pattern from `LayerStylePanel.jsx`) in the
  context bar, gated on `activeTool === 'pencil' || 'eraser' || 'line'` —
  same conditional-rendering shape as `showsShapeToggle`.

## 2. Freehand/lasso select

**Current state:** `marqueeSelect.js` is rectangle-only — `normalizeRect`/
`pointInRect` are the entire shape vocabulary. Moving/copying an existing
selection (drag inside it, shift-drag to copy) is unrelated to this gap
and already fully works for any selection shape, rect or not.

**First-pass estimate vs. actual code:** initially looked like a
data-model change (selection stored as a full boolean mask instead of a
rect). Reading `src/model/selection.js` shows this is smaller than that:
`extractRectColors`/`extractRectFromActiveLayer` already iterate a
bounding rect and build a **sparse** cell list (`{dx, dy, color}`,
skipping empty cells) — see `selection.js` lines 41-50. `clearRect`/
`clearRectAllLayers` (lines 110-133) are the same rect-iterate shape. A
lasso doesn't need a new storage representation; it needs the *same*
rect-bounded iteration with one added check: skip cells outside the traced
polygon.

**Proposed design:**
- `lassoSelect.js`: on `onPointerDown`, start collecting points; on
  `onPointerMove`, append the current cell if it differs from the last
  collected point (avoid duplicate points from sub-cell mouse movement);
  on `onPointerUp`, close the polygon and compute its bounding rect (same
  `normalizeRect` shape marquee already produces) plus a point-in-polygon
  test function (standard even-odd ray casting — no existing helper for
  this in the codebase, needs to be written).
- New extraction functions mirroring the existing ones, e.g.
  `extractPolygonColors(canvas, rect, polygon)` — identical loop to
  `extractRectColors`, with `if (!pointInPolygon(x, y, polygon)) continue;`
  added. Same treatment for a `clearPolygon`/`clearPolygonAllLayers` pair.
- `selection` state itself would need a discriminant (e.g.
  `selection.kind === 'rect' | 'polygon'`, with `polygon` carrying both
  the bounding rect and the point list) so `copySelection`/`cutSelection`
  in `store.js` can dispatch to the rect or polygon extractor. The
  *floating* selection buffer needs no change at all — it's already the
  sparse `{x, y, width, height, cells}` shape regardless of source shape.
- **Open question, not resolved here:** freehand (continuous drag) vs.
  click-to-place-vertices polygon lasso are both "lasso" in different
  tools (Photoshop offers both as separate tools). Freehand is simpler to
  implement (no vertex-click state machine) and is the more common
  pixel-art-tool default (Aseprite's lasso is freehand-only) — recommend
  starting there, leaving click-vertex polygon as a possible later
  addition if freehand proves insufficient.

## 3. Dithering brush

**Current state:** pencil paints one solid color per cell, no pattern
option. No existing dither/pattern-stamp code anywhere in `src/model` or
`src/ui/draw/tools`.

**Proposed design (v1, single-color "texture" dither):** the simplest
useful version doesn't need a second color at all — it uses `brushCells`
(section 1) but skips every other cell in a checkerboard or 2x2
Bayer-matrix pattern, so painting over an area leaves a 50%-density
texture of the active color rather than a solid fill. This composes
directly with the brush-width work above: a `ditherEnabled` boolean
(store field, same pattern as `brushWidth`) that filters `brushCells`'
output through a pattern-membership check before painting each cell —
`(cx + cy) % 2 === 0` for checkerboard, or a 4-value Bayer matrix indexed
by `(cx % 2, cy % 2)` for a slightly less regular look.
- **v2, true 2-color dither** (foreground/background blend at a chosen
  ratio, the more powerful "fake gradient" use case pixel artists actually
  want): needs a second color selector in the UI (there's currently only
  one `activeColor`) and a density/ratio control, a materially bigger UI
  lift than v1. Flagging as a distinct, larger follow-up rather than
  bundling it into the same estimate as v1 — recommend scoping v1 first
  and revisiting whether v2 is worth it once v1's actually in use.

## 4. Bucket fill: tolerance and "global" (non-contiguous) mode

**Current state:** `bucketFill.js`'s `findMatchingRegion` (lines 14-29) is
a strict BFS flood-fill — exact `ctx.colorAt(cx, cy) !== target` string
comparison, contiguous region only (stack-based 4-neighbor flood, standard
BFS). No tolerance, no "fill everywhere on canvas" variant.

**Pre-existing edge case worth noting up front:** `colorAt` (`Canvas.js`
lines 668-678) returns `null` for any cell under a non-solid (gradient)
fill — a gradient-filled shape is already invisible to bucket fill's
matching logic today (it reads as "empty," same as blank canvas). Any
tolerance work operates on solid-color comparisons and doesn't change this
— gradient shapes stay outside bucket fill's reach either way, worth
calling out explicitly rather than leaving as a silent gap.

**Proposed design:**
- **Global mode:** trivial by comparison to the other three items — no BFS
  needed at all, just `for y, for x: if (ctx.colorAt(x, y) === target) paint`
  across the whole canvas instead of the stack-based region search. A
  boolean toggle (`fillGlobal`, same store-field pattern), UI as a second
  checkbox next to wherever brush-width-style tool options land, gated on
  `activeTool === 'bucketFill'`.
- **Tolerance:** requires converting the target and candidate hex strings
  to RGB and comparing by a distance metric (simple Euclidean in RGB space
  is enough for pixel-art palettes; no need for perceptual color-distance
  math) against a threshold, replacing `findMatchingRegion`'s exact `!==`
  check. No existing hex-to-RGB helper found in `src/model` — would need a
  small new utility (or check `src/export/` for one already used during
  SVG/font compilation before writing a new one). UI: a numeric slider/
  stepper (0 = today's exact-match behavior, so this is purely additive
  and backward-compatible with existing saves/behavior at the default).

## Summary: relative implementation cost

Ordered smallest to largest, based on the above:
1. **Bucket fill global mode** — smallest; no new data shapes, a single
   boolean and a loop-shape swap.
2. **Brush width (pencil/eraser/line)** — small; one new store field, one
   new pure helper, three tool files get a one-line change each to call it
   in a loop instead of once.
3. **Dithering brush v1** — small-to-medium; builds directly on brush
   width's `brushCells`, one more store field and a pattern-membership
   filter.
4. **Bucket fill tolerance** — medium; needs a new hex-to-RGB + distance
   utility, otherwise a contained change to one function.
5. **Freehand lasso select** — largest; new tool file, new point-in-polygon
   helper, new polygon-aware extract/clear function pairs mirroring the
   existing rect ones, and a `selection` state shape change to carry a
   rect/polygon discriminant. Not a data-model rewrite (the sparse
   floating-selection buffer needs no change), but the widest blast radius
   of the four.

## Critical files

- `src/ui/draw/tools/pencil.js`, `eraser.js`, `line.js` — brush-width
  integration point (section 1).
- `src/ui/draw/tools/bucketFill.js` — tolerance + global mode (section 4).
- `src/ui/draw/tools/marqueeSelect.js` — the existing rect-selection
  pattern a new `lassoSelect.js` (section 2) would sit alongside.
- `src/model/selection.js` — `extractRectColors`/`extractRectFromActiveLayer`/
  `clearRect`/`clearRectAllLayers` are the direct templates for the
  polygon-aware equivalents section 2 needs.
- `src/ui/draw/SvgPixelEditor.jsx` — where `ctx` is built (~194-248); any
  new tool setting needs a getter added here.
- `src/state/store.js` — `activeTool`/`activeColor`/`shapeFilled` (~225-227)
  is the exact precedent for every new field this doc proposes.
- `src/ui/draw/ContextBar.jsx` — `showsShapeToggle`'s conditional-rendering
  pattern (tool-gated UI controls) is the template for every new control's
  visibility.
