# Tool roadmap: implementation plan + full sort results

**Status:** planning complete, nothing implemented yet. Written session 20
(2026-07-09), as a follow-up to [`docs/tool-options.md`](./tool-options.md)
(items 1-5 below). This doc is the **NEXT SESSION** starting point —
begin at Checkpoint 1.

## How this came together

Session 20 did a full survey of what a standard pixel-art tool (Aseprite,
Piskel) would have that Pixel tier lacks, and what a standard vector-art
tool (Illustrator, Inkscape, Figma) would have that Shape tier lacks —
23 items total, every one checked against the real source (not
guesswork). The full list was sorted, one item at a time, into
implement / backlog / dismiss. This doc covers the **11 "implement"
items**, scoped into seven checkpoints. The rest of the sort results are
at the bottom, so nothing from that pass is lost even though it isn't
being built yet.

**Resolved design decisions for flip/rotate (Checkpoint 6):**
- Layer-level flip/rotate on a multi-shape layer transforms the whole
  layer as one unit around the **canvas's shared axis** (not each shape
  around its own center) — matches Photoshop/Aseprite's "flip layer."
- Frame scope: **both** "this frame only" and "all frames" should be
  available as separate user choices, not just one default — needs a UI
  affordance (two menu items, or a modifier key) decided at implementation
  time.
- Glyph mode: 90° rotate stays **available**, with the rotated result
  auto re-cropped/padded back to `pixelsPerEm` height afterward, behind a
  warning confirmation (reusing `requestConfirm`) since the re-crop is
  lossy. Flip needs no such handling.

---

## Checkpoint 1 — Pixel paint-tool cluster (brush width, dithering, bucket fill global+tolerance, pixel-perfect)

**Full spec already written: [`docs/tool-options.md`](./tool-options.md).**
Brush width (pencil/eraser/line), dithering brush v1, bucket fill global
mode, bucket fill tolerance, and pixel-perfect line/pencil all compose
together (same `brushCells`/pointer-path code, same `bucketFill.js`).
Implement as one cluster:
- `brushWidth`/`ditherEnabled`/`fillGlobal`/`fillTolerance`/`pixelPerfect`
  store fields, all following the `shapeFilled` precedent (`store.js`
  ~225-227) — working-session state, not undo-tracked.
- New `src/ui/draw/tools/brush.js`: `brushCells(cx, cy, width)` (square
  stamp), reused by `pencil.js`/`eraser.js`/`line.js`.
- `bucketFill.js`: global-mode loop swap, tolerance via a new hex-to-RGB
  distance utility.
- `line.js`: pixel-perfect correction on `computeLineCells`, reused by
  `pencil.js`'s path-following.
- **Where controls live, resolved:** `ContextBar.jsx` becomes a
  two-column layout. One column keeps today's existing controls (tier
  toggle, symmetry+grid icons, undo/redo, canvas/glyph resize). The other
  column is a new, visually divided section (e.g. a `border-left`/
  `border-right` separator) holding the tool-specific context controls
  from this cluster — brush width, dither toggle, pixel-perfect toggle,
  fill tolerance/global — each still gated tool-conditional the same way
  `showsShapeToggle` already works, just rendered in the second column
  instead of competing for space in the first. This is the starting
  layout; revisit if that second column itself gets crowded once
  Checkpoint 7's gradient tool controls land.

**Verification:** `npm test` (new tests for `brushCells`, tolerance-distance
utility, pixel-perfect line correction), manual browser check of each
tool with each new option, including Glyph mode for width/pixel-perfect.

---

## Checkpoint 2 — Nudge

**New keydown branch in `SvgPixelEditor.jsx`'s handler (lines 83-139)**,
alongside the existing Undo/Redo/Escape/Enter/Copy/Cut/Paste/SelectAll
cases, guarded by the same input-focus check (lines 88-89).

Per-case target, in priority order (mirrors the existing Escape/Enter
floating-selection-first priority):
1. **`floatingSelection` present** (any mode/tier) → `moveFloatingSelection(x+dx, y+dy)` (already exists, `store.js:863`). Not committed to undo per-keypress, consistent with drag-move's existing behavior.
2. **No selection, Shape tier (`tier === 'advanced'`) with an active shape** → `setGridProps(canvas.activeLayerId, canvas.activeGridId, { offsetX: activeGrid.offsetX+dx, offsetY: activeGrid.offsetY+dy })` — `setGridProps` already exists (`store.js:362-369`) and already commits to undo. Null-guard `activeGrid`.
3. **Pixel tier or Glyph mode, no selection** — shift the active layer's
   entire current-frame content by `(dx, dy)` — apply the same offset
   delta to every Grid in that layer's active frame, the Pixel-tier
   equivalent of "move this whole layer." Reuses the translation pattern
   `resizeCanvas` already establishes (`Canvas.js:641-654`, a delta-shift
   across every grid's `offsetX`/`offsetY`), scoped to one layer's active
   frame instead of every layer/frame. Needs a new store action (e.g.
   `nudgeLayerFrame(layerId, frameIndex, dx, dy)`), committing to undo
   per keypress for consistency with case 2. Glyph mode's synthetic
   canvas always has exactly one layer, so this applies unchanged there.

Step size: 1px on plain arrow key; a modifier (Shift, matching common
convention) for a larger step (e.g. 10px) — exact step size/modifier is a
small implementation-time choice.

**Verification:** `npm test` (new coverage for `nudgeLayerFrame`, plus
`setGridProps`/`moveFloatingSelection` call sites if needed); manual
browser check — nudge a floating selection, nudge an active Shape-tier
shape, nudge a Pixel-tier layer's content, nudge in Glyph mode.

---

## Checkpoint 3 — Generate palette from image

Reuses the existing decode pipeline end-to-end — no new algorithm work:
- `src/io/imageDecode.js`'s `decodeImageFile(file)` → `RgbaImage`
  (`{width, height, data}`), already imported in `store.js:62`.
- `src/model/importRaster.js`'s `generatePalette(image, maxColors)` —
  needs adding to `store.js`'s import line (currently only
  `importRasterToGrid` is imported).
- **Add-or-replace prompt:** unlike `importLospecPalette`'s silent
  wholesale replace, this action asks the user whether to **add** the
  generated colors to the existing palette or **replace** it entirely.
  The existing `ConfirmModal`/`requestConfirm` (session 20 checkpoint 1)
  is binary Cancel/Confirm, not a fit for a 3-way choice — needs a small
  new modal (or a `ConfirmModal` variant supporting custom button
  labels/outcomes: Cancel / Add / Replace). Store action shape:
  `importPaletteFromImage(file, { maxColors, mode })` where `mode` is
  `'add'` (append new colors, dedupe against existing) or `'replace'`
  (mirrors `importLospecPalette`'s `canvas.palette.colors = ...`).
- UI: new file-picker input in `MenuBar.jsx`, mirroring the existing
  `paletteFileInputRef` pattern (lines 133/218-222) but `accept="image/*"`,
  wired as a new "Import Palette from Image…" Palette-menu item, opening
  the add/replace prompt after the image is picked and decoded.

**Verification:** `npm test` (new store-action coverage in
`test/state/store.test.js`, both `mode` branches), manual browser check —
import an image's palette, confirm both Add (existing colors preserved,
new ones appended/deduped) and Replace (wholesale swap) behave correctly.

---

## Checkpoint 4 — Configurable tile/sub-grid guide overlay

- New store field `tileGridSize` (e.g. default `0`/off, or `8`), following
  `showGrid`/`toggleGrid`'s exact non-undo-tracked pattern
  (`store.js:231/243`). **Must be an integer** — a fractional tile size
  makes no sense against a cell-based grid. Enforce with
  `Math.round`/`parseInt` on the setter and a plain-integer
  `<input type="number" step={1} min={1}>` in the UI, not a free-form
  fractional stepper.
- `GridOverlay.jsx`: add a second `<pattern id="pixelyph-tile-grid">` +
  `<rect>` pair inside the same component (not a sibling component —
  avoids duplicating the `width`/`height`/`offsetX`/`offsetY` prop
  plumbing already flowing in from `SvgPixelEditor.jsx:471-478`), heavier
  stroke, `width={tileGridSize} height={tileGridSize}`, conditionally
  rendered when enabled.
- UI: a numeric control (size) + toggle, likely in `ContextBar.jsx` near
  the existing grid-toggle `IconButton`.

**Verification:** manual browser check only (pure presentational SVG
pattern change, no model/store logic worth a unit test) — toggle on,
confirm tile lines render at the right spacing and don't conflict
visually with the existing 1px grid.

---

## Checkpoint 5 — OS-clipboard paste-in from external raster apps

- New `document.addEventListener('paste', ...)` (or `window`-level,
  matching the existing keydown listener's scope at
  `SvgPixelEditor.jsx:137`) reading `event.clipboardData.items` for an
  image MIME type, extracting a `Blob`.
- Feed the blob into the same pipeline `importRasterImage` already uses
  (`store.js:925-941`) — may need a small refactor to accept an
  already-decoded image/blob, not only a `File`, since clipboard data
  arrives as a `Blob` not a `File` picker result.
- **Verify empirically in the Electron build, not just the web/Vite dev
  build** — `navigator.clipboard`/paste-event APIs are Chromium-based and
  *should* work identically in Electron's renderer (unlike
  `saveFile`/`openFile`, which need native dialogs via
  `src/io/platform.js`'s IPC bridge), but this needs confirming, not
  assuming. If a gap surfaces, `platform.js`'s existing `isElectron()`
  fork pattern (lines 7-10) is the template for an Electron-specific path.

**Verification:** manual check in both `npm run dev` (web/Vite) and the
Electron dev build (`npm run electron:dev`) — copy an image in an
external app, paste into Pixelyph, confirm it lands as a floating
selection (matching internal paste's drop-in point) in both builds.

---

## Checkpoint 6 — Whole-canvas/layer/shape flip and 90° rotation

Resolves the two previously-unscoped `BACKLOG.md` entries "Canvas and
layer axis flipping" and "Whole-image and layer 90° rotations."

**Core primitive** (new, e.g. in `Grid.js` or an adjacent module): a pure
buffer transform on `{width, height, pixels}`:
- Flip-H: `new[y*w+x] = old[y*w+(w-1-x)]`
- Flip-V: `new[y*w+x] = old[(h-1-y)*w+x]`
- Rotate-90: width/height swap + standard raster rotate index remap.

**Three scopes, one shared primitive + scope-specific offset handling:**
- **Shape-level** (one Grid): transform in place around the shape's own
  center — no shared-axis complication.
- **Layer-level** (every Grid in a layer, per the frame-scope choice
  above): transform each grid's buffer via the shared primitive, **then**
  reposition each grid's `offsetX/offsetY` against the **canvas's**
  width/height (not each grid's own), so relative shape positions flip
  together — new axis-remap math, not a translation (unlike every
  existing offset-adjusting function — `resizeCanvas`, `growGridToInclude`
  — which are pure translations). This is the one genuinely novel piece
  of math in this checkpoint; budget real time for it.
- **Canvas-level**: same as layer-level, applied to every layer via the
  `resizeCanvas`-style triple loop (`Canvas.js:641-654`), plus swapping
  `canvas.width`/`canvas.height` for rotation.

**Glyph mode:** flip available with no special handling (width/height
unchanged). Rotate available, with a re-crop/pad step afterward
(reusing/adapting `GlyphSet.js`'s existing resize crop/pad logic,
`resizeGlyphSet`, lines ~121-127) to restore `pixelsPerEm` height, behind
a warning confirmation (`requestConfirm`) since the re-crop is lossy —
only shown when the rotated result actually needs cropping/padding, not
on every rotate.

**UI placement:**
- Shape/layer-scoped Flip H / Flip V / Rotate 90° → `LayersToolbar` in
  `LayersPanel.jsx`, added to both existing action branches (shape actions
  ~294-307, layer actions ~308-322), same `IconButton` pattern as the
  existing Move Up/Down/Duplicate/Merge Down/Delete set. New icons needed
  in `icons.jsx` (none exist today).
- Whole-canvas Flip H / Flip V / Rotate 90° → `ContextBar.jsx`, near
  `CanvasSizeControl` (lines 45-68) — the existing canvas-wide-concerns
  neighborhood, distinct from `LayersToolbar`'s per-item actions.

**No export-side changes needed** — confirmed `composeLayersSvg.js` reads
geometry live off the model on every call, no caching/memoization keyed
off dimensions.

**Verification:** `npm test` (new tests for the flip/rotate primitive and
each scope's offset-remap math), manual browser check of all three scopes
in both Draw-mode tiers and Glyph mode (including the re-crop/pad
behavior on a non-square glyph).

---

## Checkpoint 7 — Interactive on-canvas gradient tool

The most novel piece of UI in this whole plan — no existing precedent for
an interactive control with its own pointer-drag handling rendered inside
the live artwork `<svg>` (the closest analog, `GradientEditorModal.jsx`'s
`StopBar`, is plain HTML in a modal, not SVG on the canvas).

**Data/coordinate grounding** (confirmed via `layerStyle.js`, shared
unmodified by both export and the live editing surface — no drift risk
between preview and export):
- Linear gradient `angle` (degrees) → unit vector in the shape's
  **objectBoundingBox** space (`layerStyle.js`'s existing
  `cos(rad)*0.5`/`sin(rad)*0.5` math) — a drag needs the inverse,
  `atan2(dy, dx)`, computed from a drag vector expressed in that same
  bounding-box-fraction space.
- Radial `cx`/`cy`/`r` map **directly** 1:1 onto SVG's own `cx`/`cy`/`r`
  (already normalized 0-1 fractions of the shape's bounding box) — a drag
  needs `(pointerX - boxLeft)/boxWidth`, `(pointerY - boxTop)/boxHeight`
  for cx/cy, and a distance/box-dimension ratio for `r`.
- `clientToCell`'s pre-floor `px, py` (`SvgPixelEditor.jsx:250-263`) is
  the existing client→canvas-space conversion to build the drag math on,
  combined with the active grid's `offsetX/offsetY/width/height`.

**New store action needed — do not reuse `updateGridStyle` per
pointer-move:** `updateGridStyle` (`store.js:381-388`) calls `commit()`
on every invocation (full undo snapshot + autosave) — fine for a single
modal confirm, would spam undo history once per drag pixel. Needs a
`paintCellLive`/`commitStroke`-shaped pair instead: a new
`updateGridStyleLive(layerId, gridId, patch)` that mutates `grid.style`
in place with **no** `commit()` call (paired with `SvgPixelEditor.jsx`'s
existing local `tick()` re-render trick, same shape as `ctx.paintCellLive`
at lines 221-224), then the existing commit-only action once on
pointer-up for one undo entry per whole drag.

**New on-canvas handle component**, modeled on `GradientEditorModal.jsx`'s
`StopBar` pattern (per-element `setPointerCapture`, local pointermove
math, clamped values) but adapted to live inside the SVG artwork tree
instead of an HTML modal — likely only rendered when the active
Shape-tier grid's fill is a gradient and that shape is selected, similar
conditionally-rendered footprint to the existing floating-selection
overlay (`SvgPixelEditor.jsx:442-458`).

**Scope carefully** — the biggest, least-precedented item in the plan.
Recommend implementing linear-angle drag first (simpler: one rotation
handle) before radial cx/cy/r (three degrees of freedom), as two
sub-steps within this checkpoint rather than one big bang.

**Verification:** manual browser check only for the interaction itself,
`npm test` for the angle/position math conversion functions if extracted
as pure functions (recommended, for the same reason
`computeLineCells`/`brushCells` are pure and tested).

---

## Suggested sequencing across future sessions

1. **Checkpoint 1** (pixel-tool cluster) — biggest, but fully spec'd already, lowest research risk.
2. **Checkpoints 2-4** (nudge, palette-from-image, tile-guide) — all small, independent, can go in one session together.
3. **Checkpoint 5** (clipboard paste-in) — small-medium, needs the Electron empirical check.
4. **Checkpoint 6** (flip/rotate) — medium-big, design decisions now resolved, but the axis-remap math is genuinely new.
5. **Checkpoint 7** (gradient tool) — biggest architecturally, do last.

---

## Full sort results (everything from the 23-item gap-analysis pass)

Not repeating each item's full technical detail here — see the session
20 conversation record / `docs/tool-options.md` for items 1-5. This is
the accounting, so the sort itself isn't lost.

**Implement (this doc, Checkpoints 1-7):** brush width, dithering v1,
bucket fill global mode, bucket fill tolerance, pixel-perfect line/pencil,
whole-canvas/layer/shape flip+rotate, interactive on-canvas gradient tool,
nudge, generate palette from image, configurable tile guide overlay,
OS-clipboard paste-in.

**Top-of-backlog (priority, has dependencies — not scoped into a
checkpoint above, pick up once a dependency lands):**
- Boolean shape operations (union/subtract/intersect) — blocked on
  multi-select (below), or could instead follow the Merge-Down convention
  (act on "active shape + whatever's below it in stack") to avoid that
  dependency entirely — worth deciding which approach when this is picked
  up.
- Object select-and-drag tool (click a shape/layer directly to select and
  move it, distinct from nudge above and from marquee-rect-based move).
- Multi-select interaction (shift/ctrl-click in `LayersPanel.jsx`) —
  unblocks both boolean ops above and alignment/distribution below;
  bumped up specifically because it's a shared prerequisite for two
  other items, not standalone.

**Backlog (no urgency, no blockers):**
- Magic wand (select by color, Pixel tier only).
- Auto-trim canvas to content.
- Color replace / recolor-only paint mode.
- Custom/preset brush shapes — sequence after Checkpoint 1 ships and gets used.
- Alignment/distribution tools — blocked on multi-select, above.
- Style eyedropper (copy a shape's full fill+stroke+effects).
- Rounded-rectangle corner radius / polygon-star shape tool.
- Post-creation resize/transform handles on an existing shape.

**Long-term backlog:**
- Alpha/opacity-blend painting tool — deep architectural mismatch
  (every pixel is a strict boolean 0/1 today, save format bit-packs one
  bit per pixel); blast radius comparable to the whole Layer/Frame/Grid
  redesign, not a single-tool addition.

**Filed separately, general project backlog (not tools-specific) — see
`BACKLOG.md`'s own "Explore: Masks" entry:** clipping masks and
Photoshop-style color-adjustment/blend-mode layers. Too vague and
cross-cutting to scope here; needs its own research pass.

**Dismissed (checked, explicitly rejected, not overlooked):**
- Bezier pen tool / arbitrary path authoring — shapes are pixel grids
  authored by painting, not vector paths with control-point handles;
  doesn't fit the architecture and wasn't wanted anyway.
- Arbitrary rotate/skew/scale of a shape — would need pixel resampling,
  breaking the "every pixel is a deliberate, exact choice" premise;
  90°-only rotation (Checkpoint 6) sidesteps this by staying
  resample-free.
